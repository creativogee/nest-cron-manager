import { OnModuleInit } from '@nestjs/common';
import { CronJob } from 'cron';
import {
  CreateCronConfig,
  CronConfig,
  CronManagerDeps,
  CronManager as CronManagerInterface,
  EndJob,
  JobCallback,
  UpdateCronConfig,
} from '../types';

export class CronManager implements CronManagerInterface, OnModuleInit {
  private logger: any;
  private configService: any;
  private cronConfigRepository: any;
  private cronJobRepository: any;
  private redisService: any;
  private cronJobService: any;
  private cronJobs: Map<string, CronJob> = new Map();

  constructor({
    logger,
    configService,
    cronConfigRepository,
    cronJobRepository,
    redisService,
    cronJobService,
  }: CronManagerDeps) {
    this.logger = logger;
    this.configService = configService;
    this.cronConfigRepository = cronConfigRepository;
    this.cronJobRepository = cronJobRepository;
    this.redisService = redisService;
    this.cronJobService = cronJobService;
  }

  onModuleInit() {
    const config = this.configService.get('app');

    if (!config.cronManager) {
      return;
    }

    this.initializeJobs();
  }

  checkInit() {
    return (
      !!this.logger &&
      !!this.configService &&
      !!this.cronConfigRepository &&
      !!this.cronJobRepository &&
      !!this.redisService
    );
  }

  async createCronConfig(data: CreateCronConfig) {
    const cronConfig = await this.cronConfigRepository.save(data);

    if (cronConfig.cronExpression) {
      this.resetJobs();
    }

    return { cronConfig };
  }

  async updateCronConfig(data: UpdateCronConfig) {
    const found = await this.cronConfigRepository.findOne({
      where: { id: data.id },
    });

    if (!found) {
      throw new Error('CronConfig not found');
    }

    Object.assign(found, data);

    const cronConfig = await this.cronConfigRepository.save(found);

    if (cronConfig.cronExpression) {
      this.resetJobs();
    }

    return { cronConfig };
  }

  async handleJob(name: string, callback: JobCallback) {
    const config = this.configService.get('app');

    if (!config.cronManager) {
      return;
    }

    let status: EndJob['status'];
    let result: string;

    const redis = this.redisService.getClient();
    const lockKey = `cron-lock-${name}`;
    const lockValue = Date.now().toString();
    let acquiredLock: string;

    try {
      const start = await this.startJob(name);

      if (!start?.job) return;

      const { job, context } = start;

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
        result = await callback(context, config);
        status = 'Success';
      } catch (error) {
        result = error;
        status = 'Failed';
      }

      await this.endJob({ job, status, result });
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
    const cronConfigs = await this.cronConfigRepository.find();
    cronConfigs.forEach((cronConfig: CronConfig) => this.scheduleJob(cronConfig));
  }

  private async scheduleJob(cronConfig: CronConfig) {
    if (!cronConfig.enabled || cronConfig.deletedAt || !cronConfig.cronExpression) {
      return;
    }

    const job = new CronJob(cronConfig.cronExpression, () => {
      this.executeJob(cronConfig);
    });
    job.start();
    this.cronJobs.set(cronConfig.name, job);
  }

  private async executeJob(cronConfig: CronConfig) {
    const callback: JobCallback = await this.cronJobService?.[cronConfig.name];

    if (!callback) {
      this.logger.error(`Job: ${cronConfig.name} not found`);
      return;
    }

    await this.handleJob(cronConfig.name, callback);
  }

  private async resetJobs() {
    const cronConfigs = await this.cronConfigRepository.find();

    this.cronJobs.forEach((job, name) => {
      job.stop();
      this.cronJobs.delete(name);
    });

    cronConfigs.forEach((cronConfig: CronConfig) => this.scheduleJob(cronConfig));
  }

  private async startJob(name: string) {
    const cronConfig = await this.cronConfigRepository.findOne({
      where: { name },
    });

    if (!cronConfig?.enabled || cronConfig?.deletedAt) {
      this.logger.log(`Job: ${name} not found or disabled`);
      return;
    }

    const cronJob = this.cronJobRepository.create({
      config: cronConfig,
      startedAt: new Date(),
    });

    const context = JSON.parse(cronConfig?.context || '{}');

    return { job: cronJob, context };
  }

  private async endJob({ job, status, result }: EndJob) {
    job.completedAt = status === 'Success' ? new Date() : null;
    job.failedAt = status === 'Failed' ? new Date() : null;
    job.result = typeof result === 'object' ? JSON.stringify(result) : result;

    await this.cronJobRepository.save(job);
  }
}
