import { OnModuleInit } from '@nestjs/common';
import { CronJob as Job } from 'cron';
import crypto from 'crypto-js';
import { Redis } from 'ioredis';
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
  JobContext,
  JobExecution,
  Lens as LensInterface,
  UpdateCronConfig,
} from '../types';
import { delay, intervalToCron, isJSON, validateDeps } from './helper';

export const CMC_WATCH = 'cmc';
const out_cmc = (cronConfig: CronConfig) => cronConfig.name !== CMC_WATCH;

export class CronManager implements CronManagerInterface, OnModuleInit {
  private readonly replicaId: string;
  private readonly logger: any;
  private readonly cronManagerControlRepository: any;
  private readonly cronConfigRepository: any;
  private readonly cronJobRepository: any;
  private readonly redisService: any;
  private readonly orm: 'typeorm' | 'mongoose';
  private readonly watchTime: string;
  private readonly enabled: boolean;
  private readonly querySecret: string;
  private readonly entityManager: any;
  private readonly cronJobService: any;
  private databaseOps: DatabaseOps;
  private readonly cronJobs: Map<string, Job> = new Map();

  static readonly JobType = {
    INLINE: 'inline',
    QUERY: 'query',
    METHOD: 'method',
  };

  constructor({
    replicaId,
    logger,
    enabled = false,
    watchTime = '5s',
    querySecret,
    orm,
    cronConfigRepository,
    cronJobRepository,
    redisService,
    cronJobService,
    entityManager,
    cronManagerControlRepository,
  }: CronManagerDeps) {
    this.replicaId = replicaId;
    this.logger = logger;
    this.cronManagerControlRepository = cronManagerControlRepository;
    this.orm = orm;
    this.cronConfigRepository = cronConfigRepository;
    this.cronJobRepository = cronJobRepository;
    this.redisService = redisService;
    this.entityManager = entityManager;
    this.cronJobService = cronJobService;
    this.enabled = enabled;
    this.watchTime = intervalToCron(watchTime, this.logger);
    this.querySecret = querySecret;
  }

  onModuleInit() {
    const deps = validateDeps({
      replicaId: this.replicaId,
      cronManagerControlRepository: this.cronManagerControlRepository,
      cronConfigRepository: this.cronConfigRepository,
      cronJobRepository: this.cronJobRepository,
      orm: this.orm,
      logger: this.logger,
      redisService: this.redisService,
      entityManager: this.entityManager,
      querySecret: this.querySecret,
    });

    this.databaseOps = deps.databaseOps;

    this.prepare().then(() => {
      this.logger.log(`Initialized with replicaId: ${this.replicaId}`);
    });
  }

  checkInit() {
    const statuses = [
      {
        name: 'replicaId',
        status: this.replicaId ? this.replicaId : 'Not Found',
      },
      {
        name: 'logger',
        status: this.logger ? 'OK' : 'Not Found',
      },
      {
        name: 'cronManagerControlRepository',
        status: this.cronManagerControlRepository ? 'OK' : 'Not Found',
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
        name: 'orm',
        status: this.orm ? 'OK' : 'Not Found',
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

  private async isGlobalEnabled() {
    try {
      const control = await this.databaseOps.getControl();
      return !!control?.enabled;
    } catch (error) {
      if (error?.message) {
        this.logger.warn(error.message);
      }
    }
  }

  private async prepare() {
    try {
      const [control, cronConfigs] = await Promise.all([
        this.databaseOps.getControl(),
        this.databaseOps.findCronConfig(),
      ]);

      const cmc = cronConfigs.find((cronConfig: CronConfig) => cronConfig.name === CMC_WATCH);

      if (!control && !!this.cronManagerControlRepository) {
        await this.databaseOps.createControl({ replicaId: this.replicaId });
      }

      if (control && !control.replicaIds.includes(this.replicaId)) {
        control.replicaIds.push(this.replicaId);
        await this.databaseOps.updateControl(control);
      }

      if (cmc) {
        cmc.cronExpression = this.watchTime;
        await this.databaseOps.saveCronConfig(cmc);
      } else {
        await this.createCronConfig({
          name: CMC_WATCH,
          enabled: true,
          jobType: CronManager.JobType.QUERY,
          silent: true,
          cronExpression: this.watchTime,
        });
      }

      await this.initializeJobs();
    } catch (error) {
      this.logger.warn(error.message);

      return { cronConfigs: [] };
    }
  }

  private async initializeJobs() {
    try {
      const isEnabled = await this.isGlobalEnabled();

      if (!isEnabled || !this.enabled) {
        throw new Error(!isEnabled ? 'Cron manager is disabled' : '');
      }

      const cronConfigs = await this.databaseOps.findCronConfig();

      await Promise.all(cronConfigs.map((cronConfig) => this.scheduleJob(cronConfig)));

      const updatedCronConfigs = await this.databaseOps.findCronConfig();

      const totalEnabledJobs = this.getTotalEnabledJobs(updatedCronConfigs);

      this.logger.log('Total jobs scheduled: ' + (totalEnabledJobs - 1));
    } catch (error) {
      if (error?.message) {
        this.logger.warn(error.message);
      }
    }
  }

  private async scheduleJob(cronConfig: CronConfig) {
    try {
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
          this.logger.log(
            `Job: ${cronConfig.name} scheduled to run at ${cronConfig.cronExpression}`,
          );
        }
      }
    } catch (error) {
      if (error?.message) {
        this.logger.warn(error.message);
      }
    }
  }

  // Guranteed to be called by the cmc at watch time
  private async executeJob(cronConfig: CronConfig) {
    try {
      let execution: JobExecution;

      const control = await this.databaseOps.getControl();

      // If replicaId is not registered with control, register it
      if (!control.replicaIds.includes(this.replicaId)) {
        control.replicaIds.push(this.replicaId);
        // Also add to stale replicas to immediately trigger a reset
        // just in case it was already behind other replicas
        control.staleReplicas.push(this.replicaId);
      }

      if (control.staleReplicas.length) {
        await this.resetJobs(control);
      }

      if (cronConfig.name === CMC_WATCH) {
        return;
      }

      if (cronConfig.jobType === CronManager.JobType.QUERY) {
        if (!cronConfig.query) {
          this.logger.warn(`Job: ${cronConfig.name} query not found`);
          return;
        }

        if (!this.databaseOps?.query) {
          this.logger.warn('Query runner not found');
          return;
        }

        const query = this.decryptQuery(cronConfig.query);

        execution = async () => this.databaseOps?.query(`${query}`);
      }

      if (cronConfig.jobType === CronManager.JobType.METHOD) {
        execution = this.cronJobService?.[cronConfig.name];

        if (!execution) {
          this.logger.warn(`Job: ${cronConfig.name} method not found`);
          return;
        }
      }

      await this.handleJob(cronConfig.name, execution);
    } catch (error) {
      if (error?.message) {
        this.logger.warn(error.message);
      }
    }
  }

  private async resetJobs(control: CronManagerControl, retries = 0) {
    const maxRetries = 3;

    try {
      const isEnabled = await this.isGlobalEnabled();

      if (!isEnabled) {
        throw new Error('Cron manager is disabled');
      }

      const isStale = control?.staleReplicas.includes(this.replicaId);

      if (!isStale) {
        return;
      }

      const cronConfigs = await this.databaseOps.findCronConfig();

      this.cronJobs.forEach((job, name) => {
        job.stop();
        this.cronJobs.delete(name);
      });

      await Promise.all(cronConfigs.map((cronConfig) => this.scheduleJob(cronConfig)));

      const index = control.staleReplicas.indexOf(this.replicaId);
      if (index !== -1) {
        // this is critical in case of non-unique replicaIds
        control.staleReplicas.splice(index, 1);
      }

      try {
        const _control = await this.databaseOps.updateControl(control);

        if (!_control) {
          throw new Error();
        }
      } catch (error) {
        if (retries < maxRetries) {
          const backoffTime = Math.pow(2, retries) * 1000;
          this.logger.warn(`Failed to reset jobs; Retrying in ${backoffTime / 1000} seconds...`);

          await delay(backoffTime);
          const control = await this.getControl();
          await this.resetJobs(control, retries + 1);
        } else {
          this.logger.warn('Maximum retries reached. Failed to reset jobs.');
        }

        return;
      }

      const updatedCronConfigs = await this.databaseOps.findCronConfig();
      const totalEnabledJobs = this.getTotalEnabledJobs(updatedCronConfigs);

      this.logger.log('Total jobs scheduled: ' + (totalEnabledJobs - 1));
    } catch (error) {
      if (error?.message) {
        this.logger.warn(error.message);
      }
    }
  }

  private async startJob(name: string) {
    const cronConfig = await this.databaseOps.findOneCronConfig({ name });

    if (!cronConfig?.enabled || cronConfig?.deletedAt) {
      throw new Error();
    }

    let cronJob: CronJob | null = null;

    if (!cronConfig.silent) {
      cronJob = await this.databaseOps.createCronJob({
        config: cronConfig,
        startedAt: new Date(),
      });
    }

    const context = JSON.parse(cronConfig?.context || '{}') as JobContext;
    if (cronJob) {
      cronJob.config = cronConfig;
    }

    return { job: cronJob, context, silent: cronConfig?.silent };
  }

  private async endJob({ job, status, result }: EndJob) {
    try {
      job.completedAt = status === 'Success' ? new Date() : null;
      job.failedAt = status === 'Failed' ? new Date() : null;
      job.result = typeof result === 'object' ? JSON.stringify(result) : result;

      await this.databaseOps.saveCronJob(job);
    } catch (error) {
      if (error?.message) {
        this.logger.warn(error.message);
      }
    }
  }

  private async expireJobs(control?: CronManagerControl, retries = 0) {
    const maxRetries = 3;

    if (!control) {
      this.resetJobs(control);
    }

    if (control) {
      control.staleReplicas = control.replicaIds;

      try {
        const _control = await this.databaseOps.updateControl(control);
        if (!_control) {
          throw new Error('Failed to expire jobs');
        }
      } catch (error) {
        if (retries < maxRetries) {
          const backoffTime = Math.pow(2, retries) * 1000;
          this.logger.warn(`Failed to expire jobs; Retrying in ${backoffTime / 1000} seconds...`);

          await delay(backoffTime);
          const recentControl = await this.databaseOps.getControl();
          recentControl.staleReplicas = recentControl.replicaIds;
          await this.expireJobs(recentControl, retries + 1);
        } else {
          this.logger.warn('Maximum retries reached. Failed to update control.');
          throw error;
        }
      }
    }
  }

  private encryptQuery(text: string): string {
    if (!this.querySecret) {
      throw new Error('Query secret not found');
    }

    return crypto.AES.encrypt(text, this.querySecret).toString();
  }

  private decryptQuery(text: string): string {
    if (!this.querySecret) {
      throw new Error('Query secret not found');
    }

    const bytes = crypto.AES.decrypt(text, this.querySecret);
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

  async createCronConfig(data: CreateCronConfig) {
    try {
      const isEnabled = await this.isGlobalEnabled();

      if (!isEnabled) {
        throw new Error('Cron manager is disabled');
      }

      if (data?.query) {
        data.query = this.encryptQuery(data.query);
      }

      if (data?.cronExpression) {
        try {
          new Job(data.cronExpression, () => {});
        } catch (error) {
          throw new Error('Invalid cron expression');
        }
      }

      if (data.name === CMC_WATCH) {
        data.enabled = true;
      }

      const cronConfig: CronConfig = await this.databaseOps.saveCronConfig(data);
      this.logger.log(`Job: ${cronConfig.name} created`);

      if ([CronManager.JobType.QUERY, CronManager.JobType.METHOD].includes(data.jobType)) {
        const control = await this.databaseOps.getControl();

        await this.expireJobs(control);
      }

      return { cronConfig };
    } catch (error) {
      if (error?.message) {
        this.logger.warn(error.message);
      }
    }
  }

  async updateCronConfig({ id, ...update }: UpdateCronConfig) {
    try {
      const isEnabled = await this.isGlobalEnabled();

      if (!isEnabled) {
        throw new Error('Cron manager is disabled');
      }

      const [control, found] = await Promise.all([
        this.databaseOps.getControl(),
        this.databaseOps.findOneCronConfig({ id }),
      ]);

      if (!found) {
        throw new Error('Cron config not found');
      }

      if (found.name === CMC_WATCH) {
        throw new Error('Cannot update cmc watch');
      }

      if (update.cronExpression) {
        try {
          new Job(update.cronExpression, () => {});
        } catch (error) {
          throw new Error('Invalid cron expression');
        }
      }

      if (update.query) {
        update.query = this.encryptQuery(update.query);
      }

      Object.assign(found, update);

      const cronConfig: CronConfig = await this.databaseOps.saveCronConfig(found);
      this.logger.log(`Job: ${cronConfig.name} updated`);

      const jobType = update?.jobType ?? cronConfig.jobType;

      if ([CronManager.JobType.QUERY, CronManager.JobType.METHOD].includes(jobType)) {
        await this.expireJobs(control);
      }

      return { cronConfig };
    } catch (error) {
      if (error?.message) {
        this.logger.warn(error.message);
      }
    }
  }

  async listCronConfig(): Promise<CronConfig[]> {
    try {
      const cronConfigs = await this.databaseOps.findCronConfig();

      return cronConfigs.filter(out_cmc);
    } catch (error) {
      if (error?.message) {
        this.logger.warn(error.message);
      }
    }
  }

  async toggleCronConfig(id: number | string) {
    try {
      const isEnabled = await this.isGlobalEnabled();

      if (!isEnabled) {
        throw new Error('Cron manager is disabled');
      }

      const [control, cronConfig] = await Promise.all([
        this.databaseOps.getControl(),
        this.databaseOps.findOneCronConfig({ id }),
      ]);

      if (!cronConfig) {
        throw new Error('Cron config not found');
      }

      if (cronConfig?.name === CMC_WATCH) {
        throw new Error('Cannot toggle cmc watch');
      }

      cronConfig.enabled = !cronConfig.enabled;

      await this.databaseOps.saveCronConfig(cronConfig);
      this.logger.log(`Job: ${cronConfig.name} ${cronConfig.enabled ? 'enabled' : 'disabled'}`);

      await this.expireJobs(control);

      return { cronConfig };
    } catch (error) {
      if (error?.message) {
        this.logger.warn(error.message);
      }
    }
  }

  async enableAllCronConfig() {
    try {
      const isEnabled = await this.isGlobalEnabled();

      if (!isEnabled) {
        throw new Error('Cron manager is disabled');
      }

      const [control, cronConfigs] = await Promise.all([
        this.databaseOps.getControl(),
        this.databaseOps.findCronConfig(),
      ]);

      await Promise.all(
        cronConfigs.map(async (cronConfig: CronConfig) => {
          if (!cronConfig.enabled) {
            cronConfig.enabled = true;
            await this.databaseOps.saveCronConfig(cronConfig);
            this.logger.log(`Job: ${cronConfig.name} enabled`);
          }
        }),
      );

      await this.expireJobs(control);

      return {
        cronConfigs: cronConfigs.filter(out_cmc),
      };
    } catch (error) {
      if (error?.message) {
        this.logger.warn(error.message);
      }
    }
  }

  async disableAllCronConfig() {
    try {
      const isEnabled = await this.isGlobalEnabled();

      if (!isEnabled) {
        throw new Error('Cron manager is disabled');
      }

      const [control, cronConfigs] = await Promise.all([
        this.databaseOps.getControl(),
        this.databaseOps.findCronConfig(),
      ]);

      await Promise.all(
        cronConfigs.map(async (cronConfig: CronConfig) => {
          if (cronConfig.enabled && cronConfig.name !== CMC_WATCH) {
            cronConfig.enabled = false;
            await this.databaseOps.saveCronConfig(cronConfig);
            this.logger.log(`Job: ${cronConfig.name} disabled`);
          }
        }),
      );

      await this.expireJobs(control);

      return {
        cronConfigs: cronConfigs.filter(out_cmc),
      };
    } catch (error) {
      if (error?.message) {
        this.logger.warn(error.message);
      }
    }
  }

  async getControl() {
    try {
      const control = await this.databaseOps.getControl();

      return control;
    } catch (error) {
      if (error?.message) {
        this.logger.warn(error.message);
      }
    }
  }

  async purgeControl(retries = 0) {
    const maxRetries = 3;

    try {
      const control = await this.databaseOps.getControl();
      control.replicaIds = [];
      control.staleReplicas = [];

      try {
        const _control = await this.databaseOps.updateControl(control);

        if (!_control) {
          throw new Error();
        }
      } catch (error) {
        if (retries < maxRetries) {
          const backoffTime = Math.pow(2, retries) * 1000;
          this.logger.warn(`Failed to purge control; Retrying in ${backoffTime / 1000} seconds...`);

          await delay(backoffTime);
          await this.purgeControl(retries + 1);
        } else {
          this.logger.warn('Maximum retries reached. Failed to purge control.');
        }
        return;
      }

      await this.prepare();
      return { success: true };
    } catch (error) {
      if (error?.message) {
        this.logger.warn(error.message);
      }
    }
  }

  async toggleControl() {
    try {
      const control = await this.databaseOps.getControl();
      control.enabled = !control?.enabled;

      const _control = await this.databaseOps.updateControl(control);

      if (!_control) {
        throw new Error();
      }

      this.logger.log(`Cron manager is ${control.enabled ? 'enabled' : 'disabled'}`);

      return { enabled: !!control?.enabled };
    } catch (error) {
      if (error?.message) {
        this.logger.warn(error.message);
      }
    }
  }

  /**
   * @param name - Must match exactly the name of the caller function in the CronJobService which must also match exactly the name of the cronConfig
   * @param execution - The function to be executed
   * @warning Failure to match these names WILL lead to unexpected behavior
   */
  async handleJob(name: string, execution: JobExecution) {
    try {
      const isEnabled = await this.isGlobalEnabled();

      if (!isEnabled) {
        return;
      }

      let status: EndJob['status'];
      let result: any;

      const redis: Redis = this.redisService.getClient();
      const lockKey = `cron-lock-${name}`;
      const lockValue = Date.now().toString();
      let acquiredLock: string;

      try {
        const startedJob = await this.startJob(name);

        const { job, context, silent } = startedJob || {};

        // Here, if job is falsy it can only be because it's a dry run
        // If it's not a dry run, we throw an error
        if (!job && !silent) {
          throw new Error(`Job: ${name}; Failed to start`);
        }

        let startMessage = `Job: ${name}; Started - Success`;

        if (context?.distributed) {
          // Implement distributed locking with retry mechanism
          const ttl = context?.ttl || 29;
          const maxRetries = context?.maxRetries || 5;
          const retryDelay = context?.retryDelay || 6;

          // Try to acquire the lock with retries
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            acquiredLock = await redis.set(
              lockKey,
              lockValue,
              'PX', // Set the expiration in milliseconds
              ttl * 1000,
              'NX', // Set the lock only if it doesn't exist
            );

            if (acquiredLock) {
              startMessage = `Acquired lock for job: ${name} on attempt ${attempt}; Started - Success`;
              break;
            }

            if (attempt < maxRetries) {
              this.logger.log(
                `Job: ${name}; Lock acquisition attempt ${attempt} failed. Retrying in ${retryDelay}s...`,
              );
              await delay(retryDelay * 1000);
            }
          }

          // If we still couldn't acquire the lock after all retries
          if (!acquiredLock) {
            this.logger.warn(`Job: ${name}; Failed to acquire lock after ${maxRetries} attempts`);
            return;
          }
        }

        this.logger.log(startMessage);

        const lens: LensInterface = new Lens();

        try {
          result = await execution(context, lens);

          if (result && job?.config?.jobType === CronManager.JobType.METHOD) {
            switch (true) {
              case result instanceof Lens:
                result = result.getFrames();
                break;
              case isJSON(result):
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

        if (!silent && job) {
          await this.endJob({ job, status, result });
        }
      } catch (error) {
        if (error.message) {
          this.logger.warn(error.message);
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
    } catch (error) {
      if (error?.message) {
        this.logger.warn(error.message);
      }
    }
  }
}

export class Lens {
  private readonly frames: Frame[] = [];

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
