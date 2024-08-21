import { OnModuleInit } from '@nestjs/common';
import { CronJob as Job } from 'cron';
import crypto from 'crypto-js';
import {
  CreateCronConfig,
  CronConfig,
  CronJob,
  CronManagerControl,
  CronManagerDeps,
  CronManager as CronManagerInterface,
  DatabaseOps,
  EndJob,
  Frame,
  JobExecution,
  Lens as LensInterface,
  UpdateCronConfig,
} from '../types';
import { isJSON, validateDeps } from './helper';

const CMC_WATCH = 'cmc';
const out_cmc = (cronConfig: CronConfig) => cronConfig.name !== CMC_WATCH;

export class CronManager implements CronManagerInterface, OnModuleInit {
  private logger: any;
  private cronManagerControlRepository: any;
  private configService: any;
  private cronConfigRepository: any;
  private cronJobRepository: any;
  private redisService: any;
  private ormType: 'typeorm' | 'mongoose';
  private appCount: number;
  private watchTime: string = '*/2 * * * * *';
  private enabled: boolean;
  private querySecret: string;
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
    enabled,
    watchTime,
    appCount,
    querySecret,
    ormType,
    cronConfigRepository,
    cronJobRepository,
    redisService,
    cronJobService,
    entityManager,
    cronManagerControlRepository,
  }: CronManagerDeps) {
    this.logger = logger;
    this.cronManagerControlRepository = cronManagerControlRepository;
    this.ormType = ormType;
    this.cronConfigRepository = cronConfigRepository;
    this.cronJobRepository = cronJobRepository;
    this.redisService = redisService;
    this.entityManager = entityManager;
    this.cronJobService = cronJobService;
    this.enabled = enabled;
    this.watchTime = watchTime;
    this.appCount = appCount;
    this.querySecret = querySecret;
  }

  onModuleInit() {
    const deps = validateDeps({
      cronManagerControlRepository: this.cronManagerControlRepository,
      cronConfigRepository: this.cronConfigRepository,
      cronJobRepository: this.cronJobRepository,
      ormType: this.ormType,
      configService: this.configService,
      logger: this.logger,
      redisService: this.redisService,
      entityManager: this.entityManager,
      querySecret: this.querySecret,
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
        name: 'cronManagerControlRepository',
        status: this.cronManagerControlRepository ? 'OK' : 'Not Found',
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
        name: 'enabled',
        status: this.enabled ? 'OK' : 'Not Found',
      },
      {
        name: 'appCount',
        status: this.appCount ? 'OK' : 'Not Found',
      },
      {
        name: 'watchTime',
        status: this.watchTime ? 'OK' : 'Not Found',
      },
      {
        name: 'querySecret',
        status: this.querySecret ? 'OK' : 'Not Found',
      },
    ];

    return statuses;
  }

  async createCronConfig(data: CreateCronConfig) {
    if (data.query) {
      data.query = this.encryptQuery(data.query);
    }

    if (data.name === CMC_WATCH) {
      data.enabled = true;
    }

    const cronConfig: CronConfig = await this.databaseOps.saveCronConfig(data);

    if ([CronManager.JobType.QUERY, CronManager.JobType.METHOD].includes(data.jobType)) {
      const control = await this.databaseOps.getControl();

      await this.expireJobs(control);
    }

    return { cronConfig };
  }

  async updateCronConfig(data: UpdateCronConfig) {
    const [control, found] = await Promise.all([
      this.databaseOps.getControl(),
      this.databaseOps.findOneCronConfig({
        where: { id: data.id },
      }),
    ]);

    if (!found) {
      throw new Error('CronConfig not found');
    }

    if (found.name === CMC_WATCH) {
      throw new Error('Cannot update CMC watch');
    }

    if (data.query) {
      data.query = this.encryptQuery(data.query);
    }

    Object.assign(found, data);

    const cronConfig: CronConfig = await this.databaseOps.saveCronConfig(found);

    const jobType = data?.jobType ?? cronConfig.jobType;

    if ([CronManager.JobType.QUERY, CronManager.JobType.METHOD].includes(jobType)) {
      await this.expireJobs(control);
    }

    return { cronConfig };
  }

  async listCronConfig(): Promise<CronConfig[]> {
    const cronConfigs = await this.databaseOps.findCronConfig();

    return cronConfigs.filter(out_cmc);
  }

  async toggleCronConfig(id: number) {
    const [control, cronConfig] = await Promise.all([
      this.databaseOps.getControl(),
      this.databaseOps.findOneCronConfig({
        where: { id },
      }),
    ]);

    if (cronConfig.name === CMC_WATCH) {
      throw new Error('Cannot disable CMC watch');
    }

    if (!cronConfig) {
      throw new Error('CronConfig not found');
    }

    cronConfig.enabled = !cronConfig.enabled;

    await this.databaseOps.saveCronConfig(cronConfig);

    await this.expireJobs(control);

    return { cronConfig };
  }

  async enableAllCronConfig() {
    const [control, cronConfigs] = await Promise.all([
      this.databaseOps.getControl(),
      this.databaseOps.findCronConfig(),
    ]);

    await Promise.all(
      cronConfigs.map(async (cronConfig: CronConfig) => {
        if (!cronConfig.enabled) {
          cronConfig.enabled = true;
          await this.databaseOps.saveCronConfig(cronConfig);
        }
      }),
    );

    await this.expireJobs(control);

    return {
      cronConfigs: cronConfigs.filter(out_cmc),
    };
  }

  async disableAllCronConfig() {
    const [control, cronConfigs] = await Promise.all([
      this.databaseOps.getControl(),
      this.databaseOps.findCronConfig(),
    ]);

    await Promise.all(
      cronConfigs.map(async (cronConfig: CronConfig) => {
        if (cronConfig.enabled && cronConfig.name !== CMC_WATCH) {
          cronConfig.enabled = false;
          await this.databaseOps.saveCronConfig(cronConfig);
        }
      }),
    );

    await this.expireJobs(control);

    return {
      cronConfigs: cronConfigs.filter(out_cmc),
    };
  }

  /**
   * @param name - Must match exactly the name of the caller function in the CronJobService which must also match exactly the name of the cronConfig
   * @param execution - The function to be executed
   * @warning Failure to match these names WILL result in unexpected behavior
   */
  async handleJob(name: string, execution: JobExecution) {
    const config = this.configService?.get('app');
    const isEnabled = config?.cronManager?.enabled ?? this.enabled;
    if (!isEnabled) {
      return;
    }

    let status: EndJob['status'];
    let result: any;

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
          switch (true) {
            case result instanceof Lens:
              result = result.getFrames();
              break;
            case isJSON(result):
              result = result;
              break;
            default:
              result = JSON.stringify(result);
              break;
          }
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
    const isEnabled = this.configService?.get('app.cronManager.enabled') ?? this.enabled;

    if (!isEnabled) {
      return;
    }

    const [control, cronConfigs] = await Promise.all([
      this.databaseOps.getControl(),
      this.databaseOps.findCronConfig(),
    ]);

    const cmc = cronConfigs.find((cronConfig: CronConfig) => cronConfig.name === CMC_WATCH);

    if (!control && !!this.cronManagerControlRepository) {
      await this.databaseOps.createControl();
    }

    if (!cmc) {
      const { cronConfig } = await this.createCronConfig({
        name: CMC_WATCH,
        enabled: true,
        jobType: CronManager.JobType.QUERY,
        dryRun: true,
        cronExpression: this.watchTime,
      });

      cronConfigs.unshift(cronConfig);
    }

    await Promise.all(cronConfigs.map((cronConfig) => this.scheduleJob(cronConfig)));

    const updatedCronConfigs = await this.databaseOps.findCronConfig();

    const totalEnabledJobs = this.getTotalEnabledJobs(updatedCronConfigs);

    this.logger.log('Total jobs scheduled: ' + (totalEnabledJobs - 1));
  }

  private async scheduleJob(cronConfig: CronConfig) {
    if (
      cronConfig.enabled &&
      !cronConfig.deletedAt &&
      cronConfig.cronExpression &&
      [CronManager.JobType.QUERY, CronManager.JobType.METHOD].includes(cronConfig.jobType) &&
      !(
        cronConfig.name !== CMC_WATCH &&
        cronConfig.jobType === CronManager.JobType.QUERY &&
        !cronConfig.query
      )
    ) {
      const job = new Job(cronConfig.cronExpression, () => {
        this.executeJob(cronConfig);
      });

      job.start();
      this.cronJobs.set(cronConfig.name, job);

      if (cronConfig.name !== CMC_WATCH) {
        this.logger.log(`Job: ${cronConfig.name} scheduled to run at ${cronConfig.cronExpression}`);
      }
    }
  }

  private async executeJob(cronConfig: CronConfig) {
    let execution: JobExecution;

    const control = await this.databaseOps.getControl();

    if (control?.reset) {
      await this.resetJobs(control);
    }

    if (cronConfig.name === CMC_WATCH) {
      return;
    }

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

  private async resetJobs(control: CronManagerControl) {
    const isEnabled = this.configService?.get('app.cronManager.enabled') ?? this.enabled;
    if (!isEnabled) {
      return;
    }

    const cronConfigs = await this.databaseOps.findCronConfig();

    this.cronJobs.forEach((job, name) => {
      job.stop();
      this.cronJobs.delete(name);
    });

    await Promise.all(cronConfigs.map((cronConfig) => this.scheduleJob(cronConfig)));

    control.reset = false;
    if (control.resetCount > 0) {
      control.resetCount -= 1;
    }

    let latestVersion = control.cmcv;

    try {
      await this.databaseOps.updateControl(control);
    } catch (error) {
      const latestControl = await this.databaseOps.getControl();
      latestVersion = latestControl.cmcv;
      control.cmcv = latestVersion;
      await this.databaseOps.updateControl(control);
    }

    const updatedCronConfigs = await this.databaseOps.findCronConfig();
    const totalEnabledJobs = this.getTotalEnabledJobs(updatedCronConfigs);

    this.logger.log('Total jobs scheduled: ' + (totalEnabledJobs - 1));
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

  private async expireJobs(control: CronManagerControl) {
    if (!control) {
      this.resetJobs(control);
    }

    if (control) {
      control.reset = true;
      control.resetCount = this.appCount;

      let latestVersion = control.cmcv;

      try {
        this.databaseOps.updateControl(control);
      } catch (error) {
        const latestControl = await this.databaseOps.getControl();
        latestVersion = latestControl.cmcv;
        control.cmcv = latestVersion;
        this.databaseOps.updateControl(control);
      }
    }
  }

  private encryptQuery(text: string): string {
    const querySecret = this.configService?.get('app.cronManager.querySecret') ?? this.querySecret;
    if (!querySecret) {
      throw new Error('Query secret not found');
    }

    return crypto.AES.encrypt(text, querySecret).toString();
  }

  private decryptQuery(text: string): string {
    const querySecret = this.configService?.get('app.cronManager.querySecret') ?? this.querySecret;
    if (!querySecret) {
      throw new Error('Query secret not found');
    }

    const bytes = crypto.AES.decrypt(text, querySecret);
    return bytes.toString(crypto.enc.Utf8);
  }

  private getTotalEnabledJobs(cronConfigs: CronConfig[]): number {
    return cronConfigs.filter((cronConfig: CronConfig) => {
      switch (true) {
        case cronConfig.name === CMC_WATCH:
          return true;
        case cronConfig.jobType === CronManager.JobType.QUERY:
          return cronConfig.enabled && cronConfig.cronExpression && cronConfig.query;
        case cronConfig.jobType === CronManager.JobType.METHOD:
          return cronConfig.enabled && cronConfig.cronExpression;
        case cronConfig.jobType === CronManager.JobType.INLINE:
          return cronConfig.enabled;
        default:
          return false;
      }
    }).length;
  }
}

export class Lens {
  private frames: Frame[] = [];

  get isEmpty() {
    return this.frames.length === 0;
  }

  capture(action: Frame) {
    this.frames.push(action);
  }

  getFrames() {
    return JSON.stringify(this.frames);
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
