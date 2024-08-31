import { Test, TestingModule } from '@nestjs/testing';
import { intervalToCron } from '../src/helper';
import { CMC_WATCH, CronManager } from '../src/index';
import {
  CronConfig,
  CronJob,
  CronManagerControl,
  CronManagerDeps,
  DatabaseOps,
  EndJob,
  JobExecution,
} from '../types';

const mockCronManagerDeps: CronManagerDeps = {
  replicaId: 'test-replica-id',
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  enabled: true,
  watchTime: '5s',
  querySecret: 'test-query-secret',
  orm: 'typeorm',
  cronManagerControlRepository: {
    metadata: {
      connection: 'test-connection',
    },
    findOne: jest.fn(),
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
    update: jest.fn(),
    find: jest.fn(),
  },
  cronConfigRepository: {
    metadata: {
      connection: 'test-connection',
    },
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  },
  cronJobRepository: {
    metadata: {
      connection: 'test-connection',
    },
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  },
  redisService: {
    getClient: jest.fn(() => ({
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn(),
    })),
  },
  cronJobService: {
    getReport: jest.fn(),
  },
  entityManager: {},
};

const mockCronManagerControl: CronManagerControl = {
  id: 1,
  enabled: true,
  replicaIds: ['test-replica-id'],
  staleReplicas: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  cmcv: 'test-cmcv',
};

const mockCronConfig: CronConfig = {
  id: 1,
  name: 'test-cron-config',
  jobType: 'query',
  enabled: true,
  context: '{}',
  cronExpression: '*/5 * * * * *',
  query: 'SELECT 1',
  silent: false,
  deletedAt: null,
  jobs: [],
};

const mockCronJob: CronJob = {
  id: 1,
  config: mockCronConfig,
  result: '{}',
  startedAt: new Date(),
  completedAt: new Date(),
  failedAt: null,
};

const mockDatabaseOps: DatabaseOps = {
  createControl: jest.fn(async () => mockCronManagerControl),
  getControl: jest.fn(async () => mockCronManagerControl),
  updateControl: jest.fn(async () => mockCronManagerControl),
  findOneCronConfig: jest.fn(async () => mockCronConfig),
  findCronConfig: jest.fn(async () => [mockCronConfig]),
  createCronConfig: jest.fn(async () => mockCronConfig),
  saveCronConfig: jest.fn(async () => mockCronConfig),
  createCronJob: jest.fn(async () => mockCronJob),
  saveCronJob: jest.fn(),
  query: jest.fn(),
  isTypeOrm: jest.fn(() => true),
};

describe('CronManager', () => {
  let cronManager: CronManager;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: CronManager,
          useFactory: () => new CronManager(mockCronManagerDeps),
        },
      ],
    }).compile();

    cronManager = module.get<CronManager>(CronManager);
    cronManager.databaseOps = mockDatabaseOps;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(cronManager).toBeDefined();
  });

  describe('checkInit', () => {
    it('should return the correct statuses', () => {
      const statuses = cronManager.checkInit();

      expect(statuses).toEqual([
        { name: 'replicaId', status: 'test-replica-id' },
        { name: 'logger', status: 'OK' },
        { name: 'cronManagerControlRepository', status: 'OK' },
        { name: 'cronConfigRepository', status: 'OK' },
        { name: 'cronJobRepository', status: 'OK' },
        { name: 'redisService', status: 'OK' },
        { name: 'orm', status: 'OK' },
        { name: 'cronJobService', status: 'OK' },
        { name: 'entityManager', status: 'OK' },
        { name: 'enabled', status: 'OK' },
        { name: 'watchTime', status: 'OK' },
        { name: 'querySecret', status: 'OK' },
      ]);
    });
  });

  describe('isGlobalEnabled', () => {
    it('should return true if cron manager is enabled', async () => {
      const isEnabled = await cronManager.isGlobalEnabled();

      expect(isEnabled).toBe(true);
    });

    it('should return false if cron manager is disabled', async () => {
      cronManager.databaseOps.getControl = jest.fn(async () => ({
        ...mockCronManagerControl,
        enabled: false,
      }));

      const isEnabled = await cronManager.isGlobalEnabled();

      expect(isEnabled).toBe(false);
    });
  });

  describe('prepare', () => {
    it('should create control if not found and cronManagerControlRepository exists', async () => {
      jest.spyOn(cronManager.databaseOps, 'getControl').mockResolvedValue(null);
      await cronManager.prepare();

      expect(mockDatabaseOps.createControl).toHaveBeenCalledWith({
        replicaId: mockCronManagerDeps.replicaId,
      });
    });

    it('should update control if found and replicaId not included', async () => {
      const control = { replicaIds: [] };

      jest
        .spyOn(mockDatabaseOps, 'getControl')
        .mockResolvedValue(control as unknown as CronManagerControl);

      await cronManager.prepare();

      expect(mockDatabaseOps.updateControl).toHaveBeenCalledWith(control);
    });

    it('should create cronConfig if cmc not found', async () => {
      jest.spyOn(mockDatabaseOps, 'findCronConfig').mockResolvedValue([]);
      jest.spyOn(cronManager, 'createCronConfig');

      await cronManager.prepare();

      expect(cronManager.createCronConfig).toHaveBeenCalledWith({
        name: CMC_WATCH,
        enabled: true,
        jobType: CronManager.JobType.QUERY,
        silent: true,
        cronExpression: intervalToCron(mockCronManagerDeps.watchTime!),
      });
    });

    it('should log a warning and return empty cronConfigs if an error occurs', async () => {
      jest.spyOn(mockDatabaseOps, 'findCronConfig').mockRejectedValue(new Error('test-error'));

      const cronConfigs = await cronManager.prepare();

      expect(mockCronManagerDeps.logger.warn).toHaveBeenCalledWith('test-error');
      expect(cronConfigs).toEqual({ cronConfigs: [] });
    });
  });

  describe('initializeJobs', () => {
    it('should initialize cron jobs', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);
      jest.spyOn(cronManager, 'scheduleJob');
      jest.spyOn(cronManager, 'getTotalEnabledJobs');
      jest.spyOn(mockDatabaseOps, 'findCronConfig').mockResolvedValue([mockCronConfig]);

      await cronManager.initializeJobs();

      expect(mockDatabaseOps.findCronConfig).toHaveBeenCalled();
      expect(cronManager.scheduleJob).toHaveBeenCalledWith(mockCronConfig);
      expect(cronManager.getTotalEnabledJobs).toHaveBeenCalledWith([mockCronConfig]);
      expect(cronManager.logger.log).toHaveBeenCalledWith('Total jobs scheduled: 0');
    });

    it('should not initialize cron jobs if not globally enabled', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(false);

      await cronManager.initializeJobs();

      expect(cronManager.databaseOps.findCronConfig).not.toHaveBeenCalled();
      expect(cronManager.logger.warn).toHaveBeenCalledWith('Cron manager is disabled');
    });

    it('should not initialize cron jobs if app is not enabled', async () => {
      cronManager.enabled = false;

      await cronManager.initializeJobs();

      expect(cronManager.databaseOps.findCronConfig).not.toHaveBeenCalled();
      expect(cronManager.logger.warn).toHaveBeenCalledWith('Cron manager is disabled');
    });
  });

  describe('scheduleJob', () => {
    it('should schedule cron job', async () => {
      await cronManager.scheduleJob(mockCronConfig);

      expect(cronManager.cronJobs.size).toBe(1);
      expect(cronManager.logger.log).toHaveBeenCalledWith(
        `Job: ${mockCronConfig.name} scheduled to run at ${mockCronConfig.cronExpression}`,
      );
    });

    it('should not schedule cron job if not enabled', async () => {
      const disabledCronConfig = { ...mockCronConfig, enabled: false };

      await cronManager.scheduleJob(disabledCronConfig);

      expect(cronManager.cronJobs.size).toBe(0);
      expect(cronManager.logger.log).not.toHaveBeenCalled();
    });

    it('should not schedule cron job if no cron expression', async () => {
      const cronConfigWithoutCronExpression = { ...mockCronConfig, cronExpression: null };

      await cronManager.scheduleJob(cronConfigWithoutCronExpression);

      expect(cronManager.cronJobs.size).toBe(0);
      expect(cronManager.logger.log).not.toHaveBeenCalled();
    });

    it('should not schedule cron job if job type is inline', async () => {
      const methodCronConfig = { ...mockCronConfig, jobType: 'inline' };

      await cronManager.scheduleJob(methodCronConfig);

      expect(cronManager.cronJobs.size).toBe(0);
      expect(cronManager.logger.log).not.toHaveBeenCalled();
    });

    it('should schedule cron job if job type is method', async () => {
      const methodCronConfig = {
        ...mockCronConfig,
        jobType: 'method',
      };

      await cronManager.scheduleJob(methodCronConfig);

      expect(cronManager.cronJobs.size).toBe(1);
      expect(cronManager.logger.log).toHaveBeenCalledWith(
        `Job: ${methodCronConfig.name} scheduled to run at ${methodCronConfig.cronExpression}`,
      );
    });

    it('should schedule cron job if job type is query', async () => {
      const methodCronConfig = {
        ...mockCronConfig,
        jobType: 'query',
      };

      jest.spyOn(cronManager, 'executeJob');

      await cronManager.scheduleJob(methodCronConfig);

      expect(cronManager.cronJobs.size).toBe(1);
      expect(cronManager.logger.log).toHaveBeenCalledWith(
        `Job: ${methodCronConfig.name} scheduled to run at ${methodCronConfig.cronExpression}`,
      );
    });

    it('should not schedule cmc watch job but not log', async () => {
      const cmcWatchCronConfig = {
        ...mockCronConfig,
        name: CMC_WATCH,
      };

      await cronManager.scheduleJob(cmcWatchCronConfig);

      expect(cronManager.cronJobs.size).toBe(1);
      expect(cronManager.logger.log).not.toHaveBeenCalled();
    });
  });

  describe('executeJob', () => {
    it('should reset stale replicas', async () => {
      const control = {
        ...mockCronManagerControl,
        staleReplicas: ['test-replica-id'],
      };
      jest
        .spyOn(mockDatabaseOps, 'getControl')
        .mockResolvedValue({ staleReplicas: ['1'] } as unknown as CronManagerControl);
      jest.spyOn(mockDatabaseOps, 'getControl').mockResolvedValue(control);

      jest.spyOn(cronManager, 'resetJobs');

      await cronManager.executeJob(mockCronConfig);

      expect(cronManager.resetJobs).toHaveBeenCalled();
    });

    it('should register untracked replica and reset', async () => {
      const control = {
        ...mockCronManagerControl,
        replicaIds: [],
      };
      jest.spyOn(mockDatabaseOps, 'getControl').mockResolvedValue(control);
      jest.spyOn(cronManager, 'resetJobs');
      jest.spyOn(control.replicaIds, 'push');
      jest.spyOn(control.staleReplicas, 'push');

      await cronManager.executeJob(mockCronConfig);

      expect(control.replicaIds.push).toHaveBeenCalledWith('test-replica-id');
      expect(control.staleReplicas.push).toHaveBeenCalledWith('test-replica-id');
      expect(cronManager.resetJobs).toHaveBeenCalled();
    });

    describe('query', () => {
      it('should complete', async () => {
        const queryCronConfig = {
          ...mockCronConfig,
          jobType: 'query',
        };

        jest.spyOn(cronManager, 'handleJob');

        await cronManager.executeJob(queryCronConfig);

        expect(cronManager.handleJob).toHaveBeenCalledWith(
          queryCronConfig.name,
          expect.any(Function),
        );
      });

      it('should return void if cronConfig name is cmc', async () => {
        const cmcCronConfig = {
          ...mockCronConfig,
          name: CMC_WATCH,
        };

        jest.spyOn(cronManager, 'handleJob');

        await cronManager.executeJob(cmcCronConfig);

        expect(cronManager.handleJob).not.toHaveBeenCalled();
      });

      it('should log warning if query is not defined', async () => {
        const queryCronConfig = {
          ...mockCronConfig,
          jobType: 'query',
          query: null,
        };

        jest.spyOn(cronManager, 'handleJob');

        await cronManager.executeJob(queryCronConfig);

        expect(cronManager.logger.warn).toHaveBeenCalledWith(
          `Job: ${queryCronConfig.name} query not found`,
        );
        expect(cronManager.handleJob).not.toHaveBeenCalled();
      });

      it('should log warning if query runner is undefined', async () => {
        const queryCronConfig = {
          ...mockCronConfig,
          jobType: 'query',
        };

        // @ts-ignore
        mockDatabaseOps.query = undefined;

        jest.spyOn(cronManager, 'handleJob');

        await cronManager.executeJob(queryCronConfig);

        expect(cronManager.logger.warn).toHaveBeenCalledWith('Query runner not found');

        expect(cronManager.handleJob).not.toHaveBeenCalled();
      });
    });

    describe('method', () => {
      it('should complete', async () => {
        const methodCronConfig: CronConfig = {
          ...mockCronConfig,
          jobType: 'method',
          name: 'getReport',
        };

        jest.spyOn(cronManager, 'handleJob');

        await cronManager.executeJob(methodCronConfig);

        expect(cronManager.handleJob).toHaveBeenCalledWith(
          methodCronConfig.name,
          expect.any(Function),
        );
      });

      it('should fail w/o defined method on cronJobService', async () => {
        const methodCronConfig: CronConfig = {
          ...mockCronConfig,
          jobType: 'method',
          query: null,
          name: 'undefinedMethod',
        };

        jest.spyOn(cronManager, 'handleJob');

        await cronManager.executeJob(methodCronConfig);

        expect(cronManager.logger.warn).toHaveBeenCalledWith(
          `Job: ${methodCronConfig.name} method not found`,
        );
        expect(cronManager.handleJob).not.toHaveBeenCalled();
      });
    });

    describe('inline job type', () => {});
  });

  describe('resetJobs', () => {
    it('should warn if globally disabled', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(false);

      await cronManager.resetJobs(mockCronManagerControl);

      expect(cronManager.logger.warn).toHaveBeenCalledWith('Cron manager is disabled');
    });

    it('should return void if not stale', async () => {
      jest.spyOn(mockDatabaseOps, 'findCronConfig');

      await cronManager.resetJobs(mockCronManagerControl);

      expect(mockDatabaseOps.findCronConfig).not.toHaveBeenCalled();
    });

    it('should not schedule jobs it no job', async () => {
      jest.spyOn(mockDatabaseOps, 'findCronConfig').mockResolvedValue([]);
      jest.spyOn(cronManager, 'scheduleJob');

      await cronManager.resetJobs(mockCronManagerControl);

      expect(cronManager.scheduleJob).not.toHaveBeenCalled();
    });

    it('should reduce stale replicas', async () => {
      const control = {
        ...mockCronManagerControl,
        staleReplicas: ['test-replica-id'],
      };

      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);
      jest.spyOn(mockDatabaseOps, 'findCronConfig').mockResolvedValue([mockCronConfig]);
      jest.spyOn(mockDatabaseOps, 'updateControl');

      await cronManager.resetJobs(control);

      expect(mockDatabaseOps.updateControl).toHaveBeenCalledWith({
        ...control,
        staleReplicas: [],
      });
    });

    it('should retry on failure with exponential backoff', async () => {
      const control = {
        ...mockCronManagerControl,
        staleReplicas: ['test-replica-id'],
      };
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);
      jest.spyOn(mockDatabaseOps, 'findCronConfig').mockResolvedValue([mockCronConfig]);
      jest.spyOn(mockDatabaseOps, 'updateControl').mockRejectedValueOnce(new Error('DB Error'));
      jest.spyOn(cronManager, 'resetJobs');
      jest.spyOn(cronManager, 'getControl');

      await cronManager.resetJobs(control);

      expect(cronManager.logger.warn).toHaveBeenCalledWith(
        'Failed to reset jobs; Retrying in 1 seconds...',
      );
      expect(cronManager.getControl).toHaveBeenCalled();
      expect(cronManager.resetJobs).toHaveBeenCalledWith(control);
    });
  });

  describe('handleJob', () => {
    it('should handle job execution', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);
      const mockExecution: JobExecution = jest.fn(async () => ({ result: 'test-result' }));

      await cronManager.handleJob(mockCronConfig.name, mockExecution);

      expect(cronManager.logger.log).toHaveBeenCalledWith(
        `Job: ${mockCronConfig.name}; Started - Success`,
      );
      expect(cronManager.logger.log).toHaveBeenCalledWith(
        `Job: ${mockCronConfig.name}; Ended - Success`,
      );
      expect(mockExecution).toHaveBeenCalled();
      expect(cronManager.databaseOps.saveCronJob).toHaveBeenCalledWith({
        ...mockCronJob,
        completedAt: expect.any(Date),
        failedAt: null,
        result: '{"result":"test-result"}',
      });
    });

    it('should not handle job execution if globally disabled', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(false);
      jest.spyOn(cronManager.redisService, 'getClient');

      await cronManager.handleJob(mockCronConfig.name, jest.fn());

      expect(cronManager.redisService.getClient).not.toHaveBeenCalled();
    });

    it('should thrown an error if it is not a silent job not initialize', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);
      jest
        .spyOn(cronManager, 'startJob')
        .mockResolvedValue({ job: null, silent: false, context: {} });

      const mockExecution: JobExecution = jest.fn(async () => ({}));

      await cronManager.handleJob(mockCronConfig.name, mockExecution);

      expect(cronManager.logger.warn).toHaveBeenCalledWith(
        `Job: ${mockCronConfig.name}; Failed to start`,
      );
    });

    it('should start if job is initialized but silent', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);
      jest
        .spyOn(cronManager, 'startJob')
        .mockResolvedValue({ job: null, silent: true, context: {} });
      const mockExecution: JobExecution = jest.fn(async () => ({}));

      await cronManager.handleJob(mockCronConfig.name, mockExecution);

      expect(cronManager.logger.log).toHaveBeenCalledWith(
        `Job: ${mockCronConfig.name}; Started - Success`,
      );
      expect(cronManager.logger.log).toHaveBeenCalledWith(
        `Job: ${mockCronConfig.name}; Ended - Success`,
      );
    });

    it('should consider distributed locking', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);
      jest
        .spyOn(cronManager, 'startJob')
        .mockResolvedValue({ job: null, silent: true, context: { distributed: true } });
      const mockExecution: JobExecution = jest.fn(async () => ({}));

      await cronManager.handleJob(mockCronConfig.name, mockExecution);

      expect(cronManager.redisService.getClient).toHaveBeenCalled();
      expect(cronManager.logger.log).toHaveBeenCalledWith(
        `Acquired lock for job: ${mockCronConfig.name}; Started - Success`,
      );
      expect(cronManager.logger.log).toHaveBeenCalledWith(
        `Released lock for job: ${mockCronConfig.name}; Ended - Success`,
      );
    });
  });

  describe('startJob', () => {
    it('should start cron job', async () => {
      const startedJob = await cronManager.startJob(mockCronConfig.name);

      expect(startedJob).toEqual({
        job: expect.objectContaining({
          config: mockCronConfig,
          startedAt: expect.any(Date),
        }),
        context: {},
        silent: false,
      });
    });

    it('should not start cron job if not enabled', async () => {
      const disabledCronConfig = { ...mockCronConfig, enabled: false };
      jest.spyOn(mockDatabaseOps, 'findOneCronConfig').mockResolvedValue(disabledCronConfig);
      try {
        await cronManager.startJob(disabledCronConfig.name);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should not initialize cron job if silent', async () => {
      const silentCronConfig = { ...mockCronConfig, silent: true };
      jest.spyOn(mockDatabaseOps, 'findOneCronConfig').mockResolvedValue(silentCronConfig);
      jest.spyOn(mockDatabaseOps, 'createCronJob');

      await cronManager.startJob(silentCronConfig.name);

      expect(mockDatabaseOps.createCronJob).not.toHaveBeenCalled();
    });
  });

  describe('endJob', () => {
    it('should end cron job', async () => {
      const endJobData: EndJob = {
        job: mockCronJob,
        status: 'Success',
        result: '{}',
      };

      await cronManager.endJob(endJobData);

      expect(cronManager.databaseOps.saveCronJob).toHaveBeenCalledWith({
        ...mockCronJob,
        completedAt: expect.any(Date),
        failedAt: null,
      });
    });
  });

  describe('expireJobs', () => {
    it('should expire cron jobs if control exist', async () => {
      await cronManager.expireJobs(mockCronManagerControl);

      expect(cronManager.databaseOps.updateControl).toHaveBeenCalledWith({
        ...mockCronManagerControl,
        staleReplicas: ['test-replica-id'],
      });
    });

    it('should expire cron jobs if control does not exist', async () => {
      jest.spyOn(cronManager, 'resetJobs');

      await cronManager.expireJobs();

      expect(cronManager.resetJobs).toHaveBeenCalled();
    });

    it('should retry on failure with exponential backoff', async () => {
      jest.spyOn(mockDatabaseOps, 'updateControl').mockRejectedValueOnce(new Error('DB Error'));
      jest.spyOn(cronManager, 'expireJobs');
      jest.spyOn(mockDatabaseOps, 'getControl');

      await cronManager.expireJobs(mockCronManagerControl);

      expect(cronManager.logger.warn).toHaveBeenCalledWith(
        'Failed to expire jobs; Retrying in 1 seconds...',
      );
      expect(mockDatabaseOps.getControl).toHaveBeenCalled();
      expect(cronManager.expireJobs).toHaveBeenCalledWith(mockCronManagerControl);
    });
  });

  describe('encryptQuery', () => {
    it('should encrypt query', () => {
      const encryptedQuery = cronManager.encryptQuery(mockCronConfig.query!);

      expect(encryptedQuery).toBeDefined();
    });

    it('should throw an error if secret is not defined', () => {
      // @ts-ignore
      cronManager.querySecret = undefined;

      try {
        cronManager.encryptQuery(mockCronConfig.query!);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('Query secret not found');
      }
    });
  });

  describe('decryptQuery', () => {
    it('should decrypt query', () => {
      const encryptedQuery = cronManager.encryptQuery(mockCronConfig.query!);
      const decryptedQuery = cronManager.decryptQuery(encryptedQuery);

      expect(decryptedQuery).toBe(mockCronConfig.query);
    });

    it('should throw an error if secret is not defined', () => {
      // @ts-ignore
      cronManager.querySecret = undefined;

      try {
        cronManager.decryptQuery('test-encrypted-query');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('Query secret not found');
      }
    });
  });

  describe('getTotalEnabledJobs', () => {
    it('should return the total number of enabled jobs', () => {
      const mockCronConfig2 = { ...mockCronConfig, name: 'test-cron-config-2' };
      const totalEnabledJobs = cronManager.getTotalEnabledJobs([mockCronConfig, mockCronConfig2]);

      expect(totalEnabledJobs).toBe(2);
    });
  });

  describe('createCronConfig', () => {
    it('should not create cron config if globally disabled', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(false);

      const cronConfig = await cronManager.createCronConfig({
        name: 'test-cron-config',
        enabled: true,
        jobType: 'query',
        cronExpression: '*/5 * * * * *',
      });

      expect(cronConfig).toBeUndefined();
    });

    it('should create cron config for inline job type', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);

      const cronConfig = await cronManager.createCronConfig({
        enabled: true,
        name: 'doSomething',
        jobType: 'inline',
      });

      expect(cronConfig).toBeDefined();
    });

    it('should create cron config for method job type', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);
      jest.spyOn(mockDatabaseOps, 'saveCronConfig');
      jest.spyOn(mockDatabaseOps, 'getControl');
      jest.spyOn(cronManager, 'expireJobs');

      const cronConfig = await cronManager.createCronConfig({
        enabled: false,
        name: 'getReport',
        jobType: 'method',
        cronExpression: '*/5 * * * * *',
      });

      expect(cronConfig).toBeDefined();
      expect(mockDatabaseOps.saveCronConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
        }),
      );
      expect(mockDatabaseOps.getControl).toHaveBeenCalled();
      expect(cronManager.expireJobs).toHaveBeenCalled();
    });

    it('should create cron config for query job type', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);
      jest.spyOn(mockDatabaseOps, 'saveCronConfig');
      jest.spyOn(mockDatabaseOps, 'getControl');
      jest.spyOn(cronManager, 'expireJobs');

      const cronConfig = await cronManager.createCronConfig({
        enabled: false,
        name: 'getReport',
        jobType: 'query',
        query: 'SELECT 1',
        cronExpression: '*/5 * * * * *',
      });

      expect(cronConfig).toBeDefined();
      expect(mockDatabaseOps.saveCronConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
        }),
      );
      expect(mockDatabaseOps.getControl).toHaveBeenCalled();
      expect(cronManager.expireJobs).toHaveBeenCalled();
    });

    it('should throw an error if invalid cronExpression', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);

      try {
        await cronManager.createCronConfig({
          enabled: true,
          name: 'getReport',
          jobType: 'query',
          query: 'SELECT 1',
          cronExpression: 'invalid',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('Invalid cron expression');
      }
    });

    it('show create auto enabled cmc watch', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);
      jest.spyOn(mockDatabaseOps, 'saveCronConfig');

      const cronConfig = await cronManager.createCronConfig({
        name: CMC_WATCH,
        enabled: false,
        jobType: 'query',
        cronExpression: '*/5 * * * * *',
      });

      expect(cronConfig).toBeDefined();
      expect(mockDatabaseOps.saveCronConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
        }),
      );
    });
  });

  describe('updateCronConfig', () => {
    it('should throw error if globally disabled', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(false);

      const cronConfig = await cronManager.updateCronConfig({
        id: mockCronConfig.id,
        enabled: true,
      });

      expect(cronConfig).toBeUndefined();
      expect(cronManager.logger.warn).toHaveBeenCalledWith('Cron manager is disabled');
    });

    it('should throw error if not found', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);
      jest.spyOn(mockDatabaseOps, 'findOneCronConfig').mockResolvedValue(null);

      const cronConfig = await cronManager.updateCronConfig({
        id: mockCronConfig.id,
        enabled: true,
      });

      expect(cronConfig).toBeUndefined();
      expect(cronManager.logger.warn).toHaveBeenCalledWith('Cron config not found');
    });

    it('should throw error if name is cmc', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);
      jest.spyOn(mockDatabaseOps, 'findOneCronConfig').mockResolvedValue({
        ...mockCronConfig,
        name: CMC_WATCH,
      });

      const cronConfig = await cronManager.updateCronConfig({
        id: mockCronConfig.id,
        name: CMC_WATCH,
        enabled: true,
      });

      expect(cronConfig).toBeUndefined();
      expect(cronManager.logger.warn).toHaveBeenCalledWith('Cannot update cmc watch');
    });

    it('should throw error if cronExpression is invalid', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);
      jest.spyOn(mockDatabaseOps, 'findOneCronConfig').mockResolvedValue(mockCronConfig);

      const cronConfig = await cronManager.updateCronConfig({
        id: mockCronConfig.id,
        cronExpression: 'invalid',
      });

      expect(cronConfig).toBeUndefined();
      expect(cronManager.logger.warn).toHaveBeenCalledWith('Invalid cron expression');
    });

    it('should encrypt query if query is defined', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);
      jest.spyOn(mockDatabaseOps, 'findOneCronConfig').mockResolvedValue(mockCronConfig);
      jest.spyOn(cronManager, 'encryptQuery');

      const cronConfig = await cronManager.updateCronConfig({
        id: mockCronConfig.id,
        query: 'SELECT 1',
      });

      expect(cronManager.encryptQuery).toHaveBeenCalledWith('SELECT 1');
      expect(cronConfig).toBeDefined();
    });

    it('should expire jobs if job type is method', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);
      jest.spyOn(mockDatabaseOps, 'getControl');
      jest.spyOn(cronManager, 'expireJobs');

      const cronConfig = await cronManager.updateCronConfig({
        id: mockCronConfig.id,
        jobType: 'method',
      });

      expect(mockDatabaseOps.getControl).toHaveBeenCalled();
      expect(cronManager.expireJobs).toHaveBeenCalled();
      expect(cronConfig).toBeDefined();
    });

    it('should expire jobs if job type is query', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);
      jest.spyOn(mockDatabaseOps, 'getControl');
      jest.spyOn(cronManager, 'expireJobs');

      const cronConfig = await cronManager.updateCronConfig({
        id: mockCronConfig.id,
        jobType: 'query',
      });

      expect(mockDatabaseOps.getControl).toHaveBeenCalled();
      expect(cronManager.expireJobs).toHaveBeenCalled();
      expect(cronConfig).toBeDefined();
    });
  });

  describe('listCronConfig', () => {
    it('should list cron configs', async () => {
      const cronConfigs = await cronManager.listCronConfig();

      expect(cronConfigs).toEqual([mockCronConfig]);
    });
  });

  describe('toggleCronConfig', () => {
    it('should toggle cron config', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);
      const { cronConfig } = (await cronManager.toggleCronConfig(mockCronConfig.id)) ?? {};

      expect(cronConfig?.enabled).toBeFalsy();
      expect(cronManager.databaseOps.saveCronConfig).toHaveBeenCalledWith({
        ...mockCronConfig,
        enabled: false,
      });
    });

    it('should throw error if globally disabled', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(false);

      const cronConfig = await cronManager.toggleCronConfig(mockCronConfig.id);

      expect(cronConfig).toBeUndefined();
      expect(cronManager.logger.warn).toHaveBeenCalledWith('Cron manager is disabled');
    });

    it('show throw error if cron config not found', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);
      jest.spyOn(mockDatabaseOps, 'findOneCronConfig').mockResolvedValue(null);

      const cronConfig = await cronManager.toggleCronConfig(mockCronConfig.id);

      expect(cronConfig).toBeUndefined();
      expect(cronManager.logger.warn).toHaveBeenCalledWith('Cron config not found');
    });

    it('should throw error if name is cmc', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);
      jest.spyOn(mockDatabaseOps, 'findOneCronConfig').mockResolvedValue({
        ...mockCronConfig,
        name: CMC_WATCH,
      });

      const cronConfig = await cronManager.toggleCronConfig(mockCronConfig.id);

      expect(cronConfig).toBeUndefined();
      expect(cronManager.logger.warn).toHaveBeenCalledWith('Cannot toggle cmc watch');
    });
  });

  describe('enableAllCronConfig', () => {
    it('should not enable all cron configs if globally disabled', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(false);

      await cronManager.enableAllCronConfig();

      expect(cronManager.logger.warn).toHaveBeenCalledWith('Cron manager is disabled');
    });

    it('should enable all cron configs', async () => {
      const cronConfig = {
        ...mockCronConfig,
        enabled: false,
      };
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);
      jest.spyOn(mockDatabaseOps, 'findCronConfig').mockResolvedValue([cronConfig]);
      jest.spyOn(mockDatabaseOps, 'saveCronConfig');
      jest.spyOn(cronManager, 'expireJobs');

      await cronManager.enableAllCronConfig();

      expect(mockDatabaseOps.findCronConfig).toHaveBeenCalled();
      expect(mockDatabaseOps.saveCronConfig).toHaveBeenCalledWith({
        ...mockCronConfig,
        enabled: true,
      });
      expect(cronManager.expireJobs).toHaveBeenCalled();
    });
  });

  describe('disableAllCronConfig', () => {
    it('should not disable all cron configs if globally disabled', async () => {
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(false);

      await cronManager.disableAllCronConfig();

      expect(cronManager.logger.warn).toHaveBeenCalledWith('Cron manager is disabled');
    });

    it('should disable all cron configs', async () => {
      const cronConfig = {
        ...mockCronConfig,
        enabled: true,
      };
      jest.spyOn(cronManager, 'isGlobalEnabled').mockResolvedValue(true);
      jest.spyOn(mockDatabaseOps, 'findCronConfig').mockResolvedValue([cronConfig]);
      jest.spyOn(mockDatabaseOps, 'saveCronConfig');
      jest.spyOn(cronManager, 'expireJobs');

      await cronManager.disableAllCronConfig();

      expect(mockDatabaseOps.findCronConfig).toHaveBeenCalled();
      expect(mockDatabaseOps.saveCronConfig).toHaveBeenCalledWith({
        ...mockCronConfig,
        enabled: false,
      });
      expect(cronManager.expireJobs).toHaveBeenCalled();
    });
  });

  describe('getControl', () => {
    it('should get cron manager control', async () => {
      jest.spyOn(cronManager, 'getControl').mockResolvedValue(mockCronManagerControl);
      const control = await cronManager.getControl();

      expect(control).toEqual(mockCronManagerControl);
    });
  });

  describe('purgeControl', () => {
    it('should purge cron manager control', async () => {
      jest.spyOn(mockDatabaseOps, 'getControl').mockResolvedValue(mockCronManagerControl);
      jest.spyOn(mockDatabaseOps, 'updateControl');
      const result = await cronManager.purgeControl();

      expect(result).toEqual({ success: true });
      expect(mockDatabaseOps.getControl).toHaveBeenCalled();
      expect(mockDatabaseOps.updateControl).toHaveBeenCalledWith(mockCronManagerControl);
    });

    it('should retry on failure with exponential backoff', async () => {
      jest
        .spyOn(cronManager.databaseOps, 'updateControl')
        .mockRejectedValueOnce(new Error('DB Error'));
      jest.spyOn(cronManager, 'purgeControl');
      jest.spyOn(cronManager, 'getControl');

      await cronManager.purgeControl();

      expect(cronManager.logger.warn).toHaveBeenCalledWith(
        'Failed to purge control; Retrying in 1 seconds...',
      );
      expect(cronManager.purgeControl).toHaveBeenCalled();
    });
  });

  describe('toggleControl', () => {
    it('should toggle cron manager control', async () => {
      jest.spyOn(mockDatabaseOps, 'updateControl').mockResolvedValue(mockCronManagerControl);
      const { enabled } = (await cronManager.toggleControl()) ?? {};

      expect(enabled).toBeFalsy();
      expect(cronManager.databaseOps.getControl).toHaveBeenCalled();
      expect(cronManager.databaseOps.updateControl).toHaveBeenCalledWith({
        ...mockCronManagerControl,
        enabled: false,
      });
      expect(cronManager.logger.log).toHaveBeenCalledWith('Cron manager is disabled');
    });

    it('should throw error if control not updated', async () => {
      jest
        .spyOn(mockDatabaseOps, 'updateControl')
        .mockResolvedValue(null as unknown as CronManagerControl);

      await cronManager.toggleControl();

      expect(cronManager.logger.log).not.toHaveBeenCalled();

      
    });
  });

  describe('intervalToCron', () => {
    it('should convert interval string to cron expression', () => {
      expect(intervalToCron('1s')).toBe('*/1 * * * * *');
      expect(intervalToCron('2s')).toBe('*/2 * * * * *');
      expect(intervalToCron('5s')).toBe('*/5 * * * * *');
      expect(intervalToCron('10')).toBe('*/5 * * * * *');
      expect(intervalToCron('invalid')).toBe('*/5 * * * * *');
    });
  });
});
