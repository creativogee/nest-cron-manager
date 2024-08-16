import { OnModuleInit } from '@nestjs/common';
import { CronJob as Job } from 'cron';
import crypto from 'crypto-js';
import {
  CreateCronConfig,
  CronConfig,
  CronJob,
  CronManagerDeps,
  CronManager as CronManagerInterface,
  DatabaseOps,
  EndJob,
  JobExecution,
  Lens as LensInterface,
  UpdateCronConfig,
} from '../types';
import { Lens, validateDeps } from './helper';

export class CronManager implements CronManagerInterface, OnModuleInit {
  private logger: any;
  private configService: any;
  private cronConfigRepository: any;
  private cronJobRepository: any;
  private redisService: any;
  private ormType: 'typeorm' | 'mongoose';
  private queryRunner: any;
  private databaseOps: DatabaseOps;
  private cronJobs: Map<string, Job> = new Map();

  static readonly JobType = {
    INLINE: 'inline',
    QUERY: 'query',
  };

  constructor({
    logger,
    configService,
    ormType,
    cronConfigRepository,
    cronJobRepository,
    redisService,
    queryRunner,
  }: CronManagerDeps) {
    this.logger = logger;
    this.configService = configService;
    this.ormType = ormType;
    this.cronConfigRepository = cronConfigRepository;
    this.cronJobRepository = cronJobRepository;
    this.redisService = redisService;
    this.queryRunner = queryRunner;
  }

  onModuleInit() {
    const deps = validateDeps({
      cronConfigRepository: this.cronConfigRepository,
      cronJobRepository: this.cronJobRepository,
      ormType: this.ormType,
      configService: this.configService,
      logger: this.logger,
      redisService: this.redisService,
      queryRunner: this.queryRunner,
    });

    this.databaseOps = deps.databaseOps;

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
      !!this.ormType
    );
  }

  async createCronConfig(data: CreateCronConfig) {
    if (data.jobType === CronManager.JobType.QUERY && data.query) {
      data.query = this.encryptQuery(data.query);
    }

    const cronConfig: CronConfig = await this.databaseOps.saveCronConfig(data);

    if ([CronManager.JobType.QUERY].includes(data.jobType)) {
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

    if (data.jobType === CronManager.JobType.QUERY && data.query) {
      data.query = this.encryptQuery(data.query);
    }

    Object.assign(found, data);

    const cronConfig: CronConfig = await this.databaseOps.saveCronConfig(found);

    if ([CronManager.JobType.QUERY].includes(data.jobType)) {
      this.resetJobs();
    }

    return { cronConfig };
  }

  /**
   * @param name - Must match exactly the name of the cronConfig
   * @param execution - The function to be executed
   */
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

      // Here, if job is falsy it can only be because it's a dry run
      // If it's not a dry run, we throw an error
      if (!job && !dryRun) {
        throw new Error(`Job: ${name}; Failed to start`);
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

      const lens: LensInterface = new Lens();

      try {
        await execution(context, config, lens);
        result = lens.getFrames();
        status = 'Success';
      } catch (error) {
        lens.capture({ title: 'Error', message: error.message });
        result = lens.getFrames();
        status = 'Failed';
      }

      if (!dryRun && job) {
        await this.endJob({ job, status, result });
      }
    } catch (error) {
      this.logger.log(error.message);
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
    if (
      !cronConfig.enabled ||
      cronConfig.deletedAt ||
      !cronConfig.cronExpression ||
      cronConfig.jobType === CronManager.JobType.INLINE
    ) {
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

    if (cronConfig.jobType === CronManager.JobType.QUERY) {
      if (!cronConfig.query) {
        this.logger.log(`Job: ${cronConfig.name} query not found`);
        return;
      }

      const query = this.decryptQuery(cronConfig.query);

      execution = async () => this.databaseOps.query(`${query}`);

      if (!execution) {
        this.logger.log(`Job: ${cronConfig.name} query failed to execute`);
        return;
      }
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
      throw new Error(`Job: ${name} not found or disabled`);
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
