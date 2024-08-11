import { OnModuleInit } from '@nestjs/common';
import { CronJob as Job } from 'cron';
import crypto from 'crypto-js';
import { validateRepos } from './helper';
import {
  CreateCronConfig,
  CronConfig,
  CronJob,
  CronManagerDeps,
  CronManager as CronManagerInterface,
  DatabaseOps,
  EndJob,
  JobExecution,
  UpdateCronConfig,
} from './types';

export class CronManager implements CronManagerInterface, OnModuleInit {
  private logger: any;
  private configService: any;
  private cronConfigRepository: any;
  private cronJobRepository: any;
  private redisService: any;
  private cronJobService: any;
  private ormType: 'typeorm' | 'mongoose';
  private databaseOps: DatabaseOps;
  private cronJobs: Map<string, Job> = new Map();

  constructor({
    logger,
    configService,
    ormType,
    cronConfigRepository,
    cronJobRepository,
    redisService,
    cronJobService,
  }: CronManagerDeps) {
    this.logger = logger;
    this.configService = configService;
    this.ormType = ormType;
    this.cronConfigRepository = cronConfigRepository;
    this.cronJobRepository = cronJobRepository;
    this.redisService = redisService;
    this.cronJobService = cronJobService;
  }

  onModuleInit() {
    const cronManager = this.configService.get('app.cronManager');

    if (!cronManager?.enabled) {
      return;
    }

    this.databaseOps = validateRepos({
      cronConfigRepository: this.cronConfigRepository,
      cronJobRepository: this.cronJobRepository,
      ormType: this.ormType,
    });

    this.initializeJobs();
  }

  checkInit() {
    return (
      !!this.logger &&
      !!this.configService &&
      !!this.cronConfigRepository &&
      !!this.cronJobRepository &&
      !!this.redisService &&
      !!this.databaseOps &&
      !!this.cronJobService &&
      !!this.ormType
    );
  }

  async createCronConfig(data: CreateCronConfig) {
    if (data.jobType === 'query' && data.query) {
      data.query = this.encryptQuery(data.query);
    }

    const cronConfig: CronConfig = await this.databaseOps.saveCronConfig(data);

    if (['method', 'query'].includes(data.jobType)) {
      this.resetJobs();
    }

    return { cronConfig };
  }

  async updateCronConfig(data: UpdateCronConfig) {
    const found = await this.databaseOps.findOneCronConfig({
      where: { id: data.id },
    });

    if (!found) {
      throw new Error('CronConfig not found');
    }

    if (data.jobType === 'query' && data.query) {
      data.query = this.encryptQuery(data.query);
    }

    Object.assign(found, data);

    const cronConfig: CronConfig = await this.databaseOps.saveCronConfig(found);

    if (['method', 'query'].includes(data.jobType)) {
      this.resetJobs();
    }

    return { cronConfig };
  }

  async handleJob(name: string, execution: JobExecution) {
    const config = this.configService.get('app');

    if (!config?.cronManager?.enabled) {
      return;
    }

    let status: EndJob['status'];
    let result: string;

    const redis = this.redisService.getClient();
    const lockKey = `cron-lock-${name}`;
    const lockValue = Date.now().toString();
    let acquiredLock: string;

    try {
      const startedJob = await this.startJob(name);

      const { job, context, dryRun } = startedJob || {};

      if (!job && !dryRun) {
        this.logger.log(`Job: ${name} not found or disabled - Not a dry run`);
        return;
      }

      let startMessage = `Job: ${name}; Started - Success`;

      if (context.distributed) {
        // Implement distributed locking
        const ttl = context?.ttl || 30;

        // Try to acquire the lock
        acquiredLock = await redis.set(
          lockKey,
          lockValue,
          'PX', // Set the expiration in milliseconds
          ttl * 1000,
          'NX', // Set the lock only if it doesn't exist
        );

        // If we couldn't acquire the lock, it means another instance is already running
        if (!acquiredLock) return;

        startMessage = `Acquired lock for job: ${name}; Started - Success`;
      }

      this.logger.log(startMessage);

      try {
        result = await execution(context, config);
        status = 'Success';
      } catch (error) {
        result = error.message;
        status = 'Failed';
      }

      if (!dryRun && job) {
        await this.endJob({ job, status, result });
      }
    } finally {
      if (status) {
        let endMessage = `Job: ${name}; Ended - ${status}`;

        if (acquiredLock) {
          // Release the lock only if we still own it
          const script = `
                if redis.call("get", KEYS[1]) == ARGV[1] then
                  return redis.call("del", KEYS[1])
                else
                  return 0
                end
              `;
          await redis.eval(script, 1, lockKey, lockValue);

          endMessage = `Released lock for job: ${name}; Ended - ${status}`;
        }

        this.logger.log(endMessage);
      }
    }
  }

  private async initializeJobs() {
    const cronConfigs = await this.databaseOps.findCronConfigs();
    cronConfigs.forEach((cronConfig: CronConfig) => this.scheduleJob(cronConfig));
  }

  private async scheduleJob(cronConfig: CronConfig) {
    if (!cronConfig.enabled || cronConfig.deletedAt || cronConfig.jobType === 'callback') {
      return;
    }

    const job = new Job(cronConfig.cronExpression, () => {
      this.executeJob(cronConfig);
    });
    job.start();
    this.cronJobs.set(cronConfig.name, job);
  }

  private async executeJob(cronConfig: CronConfig) {
    let execution: JobExecution;

    if (cronConfig.jobType === 'method') {
      execution = this.cronJobService?.[cronConfig.name];
    }

    if (cronConfig.jobType === 'query' && cronConfig.query) {
      const query = this.decryptQuery(cronConfig.query);

      execution = async () => this.databaseOps.query(`${query}`);
    }

    if (!execution) {
      this.logger.error(`Job: Execution function not defined for ${cronConfig.name}`);
      return;
    }

    await this.handleJob(cronConfig.name, execution);
  }

  private async resetJobs() {
    const cronConfigs = await this.databaseOps.findCronConfigs();

    this.cronJobs.forEach((job, name) => {
      job.stop();
      this.cronJobs.delete(name);
    });

    cronConfigs.forEach((cronConfig: CronConfig) => this.scheduleJob(cronConfig));
  }

  private async startJob(name: string) {
    const cronConfig = await this.databaseOps.findOneCronConfig({
      where: { name },
    });

    if (!cronConfig?.enabled || cronConfig?.deletedAt) {
      this.logger.log(`Job: ${name} not found or disabled`);
      return;
    }

    let cronJob: CronJob;

    if (!cronConfig.dryRun) {
      cronJob = this.databaseOps.createCronJob({
        config: cronConfig,
        startedAt: new Date(),
      });
    }

    const context = JSON.parse(cronConfig?.context || '{}');

    return { job: cronJob, context, dryRun: cronConfig?.dryRun };
  }

  private async endJob({ job, status, result }: EndJob) {
    job.completedAt = status === 'Success' ? new Date() : null;
    job.failedAt = status === 'Failed' ? new Date() : null;
    job.result = typeof result === 'object' ? JSON.stringify(result) : result;

    await this.databaseOps.saveCronJob(job);
  }

  private encryptQuery(text: string): string {
    const secretKey = this.configService.get('app.cronManager.querySecret');

    if (!secretKey) {
      throw new Error('Query secret not found');
    }

    return crypto.AES.encrypt(text, secretKey).toString();
  }

  private decryptQuery(text: string): string {
    const secretKey = this.configService.get('app.cronManager.querySecret');

    if (!secretKey) {
      throw new Error('Query secret not found');
    }

    const bytes = crypto.AES.decrypt(text, secretKey);
    return bytes.toString(crypto.enc.Utf8);
  }
}
