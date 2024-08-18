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
  private entityManager: any;
  private cronJobService: any;
  private databaseOps: DatabaseOps;
  private cronJobs: Map<string, Job> = new Map();

  static readonly JobType = {
    INLINE: 'inline',
    QUERY: 'query',
    METHOD: 'method',
  };

  constructor({
    logger,
    configService,
    ormType,
    cronConfigRepository,
    cronJobRepository,
    redisService,
    cronJobService,
    entityManager,
  }: CronManagerDeps) {
    this.logger = logger;
    this.configService = configService;
    this.ormType = ormType;
    this.cronConfigRepository = cronConfigRepository;
    this.cronJobRepository = cronJobRepository;
    this.redisService = redisService;
    this.entityManager = entityManager;
    this.cronJobService = cronJobService;
  }

  onModuleInit() {
    const deps = validateDeps({
      cronConfigRepository: this.cronConfigRepository,
      cronJobRepository: this.cronJobRepository,
      ormType: this.ormType,
      configService: this.configService,
      logger: this.logger,
      redisService: this.redisService,
      entityManager: this.entityManager,
    });

    this.databaseOps = deps.databaseOps;

    this.initializeJobs();
  }

  checkInit() {
    const statuses = [
      {
        name: 'logger',
        status: this.logger ? 'OK' : 'Not Found',
      },
      {
        name: 'configService',
        status: this.configService ? 'OK' : 'Not Found',
      },
      {
        name: 'cronConfigRepository',
        status: this.cronConfigRepository ? 'OK' : 'Not Found',
      },
      {
        name: 'cronJobRepository',
        status: this.cronJobRepository ? 'OK' : 'Not Found',
      },
      {
        name: 'redisService',
        status: this.redisService ? 'OK' : 'Not Found',
      },
      {
        name: 'ormType',
        status: this.ormType ? 'OK' : 'Not Found',
      },
      {
        name: 'cronJobService',
        status: this.cronJobService ? 'OK' : 'Not Found',
      },
      {
        name: 'entityManager',
        status: this.entityManager ? 'OK' : 'Not Found',
      },
      {
        name: 'cronJobs',
        status: 'OK',
        total: this.cronJobs.size,
      },
    ];

    return statuses;
  }

  async createCronConfig(data: CreateCronConfig) {
    if (data.query) {
      data.query = this.encryptQuery(data.query);
    }

    const cronConfig: CronConfig = await this.databaseOps.saveCronConfig(data);

    if ([CronManager.JobType.QUERY, CronManager.JobType.METHOD].includes(data.jobType)) {
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

    if (data.query) {
      data.query = this.encryptQuery(data.query);
    }

    Object.assign(found, data);

    const cronConfig: CronConfig = await this.databaseOps.saveCronConfig(found);

    if ([CronManager.JobType.QUERY, CronManager.JobType.METHOD].includes(data.jobType)) {
      this.resetJobs();
    }

    return { cronConfig };
  }

  async listCronConfig(): Promise<CronConfig[]> {
    return this.databaseOps.findCronConfig();
  }

  async toggleCronConfig(id: number) {
    const cronConfig = await this.databaseOps.findOneCronConfig({
      where: { id },
    });

    if (!cronConfig) {
      throw new Error('CronConfig not found');
    }

    cronConfig.enabled = !cronConfig.enabled;

    await this.databaseOps.saveCronConfig(cronConfig);

    this.resetJobs();

    return { cronConfig };
  }

  async enableAllCronConfig() {
    const cronConfigs = await this.databaseOps.findCronConfig();

    await Promise.all(
      cronConfigs.map(async (cronConfig: CronConfig) => {
        if (!cronConfig.enabled) {
          cronConfig.enabled = true;
          await this.databaseOps.saveCronConfig(cronConfig);
        }
      }),
    );

    await this.resetJobs();

    return { cronConfigs };
  }

  async disableAllCronConfig() {
    const cronConfigs = await this.databaseOps.findCronConfig();

    await Promise.all(
      cronConfigs.map(async (cronConfig: CronConfig) => {
        if (cronConfig.enabled) {
          cronConfig.enabled = false;
          await this.databaseOps.saveCronConfig(cronConfig);
        }
      }),
    );

    await this.resetJobs();

    return { cronConfigs };
  }

  /**
   * @param name - Must match exactly the name of the caller function in the CronJobService which must also match exactly the name of the cronConfig
   * @param execution - The function to be executed
   * @warning Failure to match these names WILL result in unexpected behavior
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
        result = await execution(context, config, lens);

        if (result && job.config.jobType === CronManager.JobType.METHOD) {
          result = JSON.stringify(result);
        }

        if (!result && !lens.isEmpty) {
          result = lens.getFrames();
        }

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
      if (error.message) {
        this.logger.log(error.message);
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
    const cronConfigs = await this.databaseOps.findCronConfig();
    await Promise.all(cronConfigs.map((cronConfig: CronConfig) => this.scheduleJob(cronConfig)));
    this.logger.log('Total jobs scheduled: ' + this.cronJobs.size);
  }

  private async scheduleJob(cronConfig: CronConfig) {
    if (
      cronConfig.enabled &&
      !cronConfig.deletedAt &&
      cronConfig.cronExpression &&
      [CronManager.JobType.QUERY, CronManager.JobType.METHOD].includes(cronConfig.jobType)
    ) {
      const job = new Job(cronConfig.cronExpression, () => {
        this.executeJob(cronConfig);
      });

      job.start();
      this.cronJobs.set(cronConfig.name, job);
      this.logger.log(`Job: ${cronConfig.name} scheduled to run at ${cronConfig.cronExpression}`);
    }
  }

  private async executeJob(cronConfig: CronConfig) {
    let execution: JobExecution;

    if (cronConfig.jobType === CronManager.JobType.QUERY) {
      if (!cronConfig.query) {
        this.logger.log(`Job: ${cronConfig.name} query not found`);
        return;
      }

      const query = this.decryptQuery(cronConfig.query);

      execution = async () => this.databaseOps?.query(`${query}`);

      if (!execution) {
        this.logger.log(`Job: ${cronConfig.name} query failed to execute`);
        return;
      }
    }

    if (cronConfig.jobType === CronManager.JobType.METHOD) {
      execution = this.cronJobService?.[cronConfig.name];
    }

    await this.handleJob(cronConfig.name, execution);
  }

  private async resetJobs() {
    const cronConfigs = await this.databaseOps.findCronConfig();

    this.cronJobs.forEach((job, name) => {
      job.stop();
      this.cronJobs.delete(name);
    });

    await Promise.all(cronConfigs.map((cronConfig: CronConfig) => this.scheduleJob(cronConfig)));
    this.logger.log('Total jobs scheduled: ' + this.cronJobs.size);
  }

  private async startJob(name: string) {
    const cronConfig = await this.databaseOps.findOneCronConfig({
      where: { name },
    });

    if (!cronConfig?.enabled || cronConfig?.deletedAt) {
      throw new Error();
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

export function bindMethods(instance: any) {
  const propertyNames = Object.getOwnPropertyNames(Object.getPrototypeOf(instance));
  for (const propertyName of propertyNames) {
    const propertyValue = instance[propertyName];
    if (typeof propertyValue === 'function' && propertyName !== 'constructor') {
      instance[propertyName] = propertyValue.bind(instance);
    }
  }
}
