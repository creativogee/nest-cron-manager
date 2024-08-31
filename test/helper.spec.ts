import { Logger } from '@nestjs/common';
import {
  delay,
  intervalToCron,
  isJSON,
  MongooseOperations,
  TypeOrmOperations,
  validateDeps,
} from '../src/helper';
import { CronConfig, CronManagerControl } from '../types';

jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('mocked-uuid'),
}));

describe('Database Operations', () => {
  describe('TypeOrmOperations', () => {
    let typeOrmOps: TypeOrmOperations;
    let mockRepositories: any;

    beforeEach(() => {
      mockRepositories = {
        cronManagerControlRepository: {
          save: jest.fn(),
          find: jest.fn(),
          update: jest.fn(),
        },
        cronConfigRepository: {
          findOne: jest.fn(),
          find: jest.fn(),
          create: jest.fn(),
          save: jest.fn(),
        },
        cronJobRepository: {
          create: jest.fn(),
          save: jest.fn(),
        },
        entityManager: {
          query: jest.fn(),
        },
      };

      typeOrmOps = new TypeOrmOperations({
        ...mockRepositories,
        querySecret: 'test-secret',
      });
    });

    it('should create control', async () => {
      const mockControl = { id: 1, cmcv: 'mocked-uuid', replicaIds: ['test-replica'] };
      mockRepositories.cronManagerControlRepository.save.mockResolvedValue(mockControl);

      const result = await typeOrmOps.createControl({ replicaId: 'test-replica' });
      expect(result).toEqual(mockControl);
      expect(mockRepositories.cronManagerControlRepository.save).toHaveBeenCalledWith({
        cmcv: 'mocked-uuid',
        replicaIds: ['test-replica'],
      });
    });

    it('should get control', async () => {
      const mockControl = { id: 1, cmcv: 'mocked-uuid', replicaIds: ['test-replica'] };
      mockRepositories.cronManagerControlRepository.find.mockResolvedValue([mockControl]);

      const result = await typeOrmOps.getControl();
      expect(result).toEqual(mockControl);
      expect(mockRepositories.cronManagerControlRepository.find).toHaveBeenCalled();
    });

    it('should return null if control is not found', async () => {
      mockRepositories.cronManagerControlRepository.find.mockResolvedValue([]);

      const result = await typeOrmOps.getControl();
      expect(result).toBeNull();
    });

    it('should update control', async () => {
      const mockControl = { id: 1, cmcv: 'mocked-uuid', replicaIds: ['test-replica'] };
      mockRepositories.cronManagerControlRepository.update.mockResolvedValue({ affected: 1 });
      mockRepositories.cronManagerControlRepository.find.mockResolvedValue([mockControl]);

      const result = await typeOrmOps.updateControl(mockControl as CronManagerControl);
      expect(result).toEqual(mockControl);
      expect(mockRepositories.cronManagerControlRepository.update).toHaveBeenCalledWith(
        { cmcv: 'mocked-uuid' },
        { ...mockControl, cmcv: 'mocked-uuid' },
      );
    });

    it('should find one cron config', async () => {
      const mockConfig = { id: 1, name: 'test-config' };
      mockRepositories.cronConfigRepository.findOne.mockResolvedValue(mockConfig);

      const result = await typeOrmOps.findOneCronConfig({ id: 1 });
      expect(result).toEqual(mockConfig);
    });

    it('should find cron configs', async () => {
      const mockConfigs = [{ id: 1, name: 'test-config' }];
      mockRepositories.cronConfigRepository.find.mockResolvedValue(mockConfigs);

      const result = await typeOrmOps.findCronConfig();
      expect(result).toEqual(mockConfigs);
    });

    it('should create cron config', async () => {
      const mockConfig = { id: 1, name: 'test-config' };
      mockRepositories.cronConfigRepository.create.mockReturnValue(mockConfig);

      const result = await typeOrmOps.createCronConfig({ name: 'test-config' } as any);
      expect(result).toEqual(mockConfig);
      expect(mockRepositories.cronConfigRepository.create).toHaveBeenCalledWith({
        name: 'test-config',
      });
    });

    it('should save cron config', async () => {
      const mockConfig = { id: 1, name: 'test-config' };
      mockRepositories.cronConfigRepository.save.mockReturnValue(mockConfig);

      const result = await typeOrmOps.saveCronConfig({
        name: 'test-config',
      } as CronConfig);
      expect(result).toEqual(mockConfig);
      expect(mockRepositories.cronConfigRepository.save).toHaveBeenCalledWith({
        name: 'test-config',
      });
    });

    it('should not save cron config if no query secret', async () => {
      typeOrmOps = new TypeOrmOperations({
        ...mockRepositories,
        querySecret: '',
      });

      await expect(
        typeOrmOps.saveCronConfig({
          name: 'test-config',
          jobType: 'query',
        } as CronConfig),
      ).rejects.toThrow('Query secret not found');
    });

    it('should create cron job', async () => {
      const mockJob = { id: 1, name: 'test-job' };
      mockRepositories.cronJobRepository.create.mockReturnValue(mockJob);

      const result = await typeOrmOps.createCronJob({ name: 'test-job' });
      expect(result).toEqual(mockJob);
      expect(mockRepositories.cronJobRepository.create).toHaveBeenCalledWith({
        name: 'test-job',
      });
    });

    it('should save cron job', async () => {
      const mockJob = { id: 1, name: 'test-job' };
      mockRepositories.cronJobRepository.save.mockReturnValue(mockJob);

      const result = await typeOrmOps.saveCronJob({ name: 'test-job' });
      expect(result).toEqual(mockJob);
      expect(mockRepositories.cronJobRepository.save).toHaveBeenCalledWith({
        name: 'test-job',
      });
    });

    it('should run query', async () => {
      mockRepositories.entityManager.query.mockResolvedValue('mocked-result');

      const result = await typeOrmOps.query('SELECT 1');
      expect(result).toEqual('mocked-result');
      expect(mockRepositories.entityManager.query).toHaveBeenCalledWith('SELECT 1');
    });

    it('should check if TypeORM is used', () => {
      expect(typeOrmOps.isTypeOrm()).toBe(true);
    });
  });

  describe('MongooseOperations', () => {
    let mongooseOps: MongooseOperations;
    let mockModels: any;

    beforeEach(() => {
      mockModels = {
        cronManagerControlModel: {
          create: jest.fn(),
          findOne: jest.fn(),
          findOneAndUpdate: jest.fn(),
        },
        cronConfigModel: {
          findOne: jest.fn(),
          find: jest.fn(),
          create: jest.fn(),
          save: jest.fn(),
        },
        cronJobModel: {
          create: jest.fn(),
          findOne: jest.fn(),
          save: jest.fn(),
        },
      };

      mongooseOps = new MongooseOperations(mockModels);
    });

    it('should create control', async () => {
      const mockControl = { id: 1, cmcv: 'mocked-uuid', replicaIds: ['test-replica'] };
      mockModels.cronManagerControlModel.create.mockResolvedValue(mockControl);

      const result = await mongooseOps.createControl({ replicaId: 'test-replica' });
      expect(result).toEqual(mockControl);
      expect(mockModels.cronManagerControlModel.create).toHaveBeenCalledWith({
        cmcv: 'mocked-uuid',
        replicaIds: ['test-replica'],
      });
    });

    it('should create control', async () => {
      const mockControl = { id: 1, cmcv: 'mocked-uuid', replicaIds: ['test-replica'] };
      mockModels.cronManagerControlModel.create.mockResolvedValue(mockControl);

      const result = await mongooseOps.createControl({ replicaId: 'test-replica' });
      expect(result).toEqual(mockControl);
      expect(mockModels.cronManagerControlModel.create).toHaveBeenCalledWith({
        cmcv: 'mocked-uuid',
        replicaIds: ['test-replica'],
      });
    });

    it('should get control', async () => {
      const mockControl = { id: 1, cmcv: 'mocked-uuid', replicaIds: ['test-replica'] };
      mockModels.cronManagerControlModel.findOne.mockResolvedValue(mockControl);

      const result = await mongooseOps.getControl();
      expect(result).toEqual(mockControl);
      expect(mockModels.cronManagerControlModel.findOne).toHaveBeenCalled();
    });

    it('should update control', async () => {
      const mockControl = { id: 1, cmcv: 'mocked-uuid', replicaIds: ['test-replica'] };
      mockModels.cronManagerControlModel.findOneAndUpdate.mockResolvedValue(mockControl);
      mockModels.cronManagerControlModel.findOne.mockResolvedValue(mockControl);

      const result = await mongooseOps.updateControl(mockControl as CronManagerControl);
      expect(result).toEqual(mockControl);
      expect(mockModels.cronManagerControlModel.findOneAndUpdate).toHaveBeenCalledWith(
        { cmcv: 'mocked-uuid' },
        { ...mockControl, cmcv: 'mocked-uuid' },
        { new: true },
      );
    });

    it('should find one cron config', async () => {
      const mockConfig = { id: 1, name: 'test-config' };
      const mockExec = jest.fn().mockResolvedValue(mockConfig);
      mockModels.cronConfigModel.findOne.mockReturnValue({ exec: mockExec });

      const result = await mongooseOps.findOneCronConfig({ id: 1 });
      expect(result).toEqual(mockConfig);
    });

    it('should find cron configs', async () => {
      const mockConfigs = [{ id: 1, name: 'test-config' }];
      const mockExec = jest.fn().mockResolvedValue(mockConfigs);
      mockModels.cronConfigModel.find.mockReturnValue({ exec: mockExec });

      const result = await mongooseOps.findCronConfig({ id: 1 });

      expect(mockModels.cronConfigModel.find).toHaveBeenCalledWith({
        _id: 1,
      });
      expect(result).toEqual(mockConfigs);
    });

    it('should create cron config', async () => {
      const mockConfig = { id: 1, name: 'test-config' };
      mockModels.cronConfigModel.create.mockReturnValue(mockConfig);

      const result = await mongooseOps.createCronConfig({ name: 'test-config' } as any);
      expect(result).toEqual(mockConfig);
      expect(mockModels.cronConfigModel.create).toHaveBeenCalledWith({
        name: 'test-config',
      });
    });

    it('should save cron config', async () => {
      const mockConfig = { id: 1, name: 'test-config' };
      const mockExec = jest.fn().mockResolvedValue(mockConfig);
      mockModels.cronConfigModel.findOne.mockReturnValue({ exec: mockExec });
      const mockSave = jest.fn().mockResolvedValue(mockConfig);
      (mockConfig as any).save = mockSave;

      const result = await mongooseOps.saveCronConfig({
        name: 'test-config',
      } as CronConfig);

      expect(result).toEqual(mockConfig);
    });

    it('should create then save if there is no existing cron config', async () => {
      const mockConfig = { id: 1, name: 'test-config' };
      const mockExec = jest.fn().mockResolvedValue(null);
      mockModels.cronConfigModel.findOne.mockReturnValue({ exec: mockExec });
      mockModels.cronConfigModel.create.mockReturnValue(mockConfig);
      const mockSave = jest.fn().mockResolvedValue(mockConfig);
      (mockConfig as any).save = mockSave;

      const result = await mongooseOps.saveCronConfig({
        name: 'test-config',
      } as CronConfig);

      expect(result).toEqual(mockConfig);
      expect(mockModels.cronConfigModel.create).toHaveBeenCalledWith({
        name: 'test-config',
      });
    });

    it('should create cron job', async () => {
      const mockConfig = { id: 1, name: 'test-config' };
      const mockJob = { id: 1, name: 'test-job' };
      mockModels.cronJobModel.create.mockReturnValue(mockJob);

      const result = await mongooseOps.createCronJob({ name: 'test-job', config: mockConfig });
      expect(result).toEqual(mockJob);
      expect(mockModels.cronJobModel.create).toHaveBeenCalledWith({
        name: 'test-job',
        configId: 1,
      });
    });

    it('should save cron job', async () => {
      const mockJob = { id: 1, name: 'test-job' };
      const mockExec = jest.fn().mockResolvedValue(mockJob);
      mockModels.cronJobModel.findOne.mockReturnValue({ exec: mockExec });
      const mockSave = jest.fn().mockResolvedValue(mockJob);
      (mockJob as any).save = mockSave;

      const result = await mongooseOps.saveCronJob({ name: 'test-job' });
      expect(result).toEqual(mockJob);
    });

    it('should create then save if there is no existing cron job', async () => {
      const mockJob = { id: 1, name: 'test-job' };
      const mockExec = jest.fn().mockResolvedValue(null);
      mockModels.cronJobModel.findOne.mockReturnValue({ exec: mockExec });
      mockModels.cronJobModel.create.mockReturnValue(mockJob);
      const mockSave = jest.fn().mockResolvedValue(mockJob);
      (mockJob as any).save = mockSave;

      const result = await mongooseOps.saveCronJob({ name: 'test-job' });
      expect(result).toEqual(mockJob);
      expect(mockModels.cronJobModel.create).toHaveBeenCalledWith({
        name: 'test-job',
      });
    });

    it('should not run query', async () => {
      await expect(mongooseOps.query('SELECT 1')).rejects.toThrow(
        'Raw SQL queries are not supported in Mongoose',
      );
    });

    it('should check if TypeORM is used', () => {
      expect(mongooseOps.isTypeOrm()).toBe(false);
    });
  });

  describe('validateDeps', () => {
    let mockDeps: any;

    beforeEach(() => {
      mockDeps = {
        replicaId: 'test-replica',
        cronManagerControlRepository: {},
        cronConfigRepository: {},
        cronJobRepository: {},
        orm: 'typeorm',
        logger: new Logger(),
        redisService: {},
        entityManager: {},
        querySecret: 'secret',
      };
    });

    it('should throw an error if control repository is not provided', () => {
      delete mockDeps.cronManagerControlRepository;
      expect(() => validateDeps(mockDeps)).toThrow('Control repository not provided');
    });

    it('should throw an error if invalid ORM type is provided', () => {
      mockDeps.orm = 'invalidOrm';
      expect(() => validateDeps(mockDeps)).toThrow('Invalid ORM type');
    });

    it('should throw an error if logger is not provided', () => {
      delete mockDeps.logger;
      expect(() => validateDeps(mockDeps)).toThrow('Logger not provided');
    });

    it('should throw an error if redis service is not provided', () => {
      delete mockDeps.redisService;
      expect(() => validateDeps(mockDeps)).toThrow('Redis service not provided');
    });

    it('should throw an error if repositories are not provided', () => {
      delete mockDeps.cronConfigRepository;
      expect(() => validateDeps(mockDeps)).toThrow('Repositories not provided');
    });

    it('should throw an error if TypeORM repositories are invalid', () => {
      mockDeps.cronConfigRepository.metadata = null;
      expect(() => validateDeps(mockDeps)).toThrow('Invalid TypeORM repositories');
    });

    it('should throw an error if Mongoose repositories are invalid', () => {
      mockDeps.orm = 'mongoose';
      mockDeps.cronConfigRepository.prototype = null;
      expect(() => validateDeps(mockDeps)).toThrow('Invalid Mongoose repositories');
    });

    it('should return databaseOps for valid TypeORM dependencies', () => {
      mockDeps.cronConfigRepository.metadata = { connection: {} };
      mockDeps.cronJobRepository.metadata = { connection: {} };
      const result = validateDeps(mockDeps);
      expect(result.databaseOps).toBeInstanceOf(TypeOrmOperations);
    });

    it('should return databaseOps for valid Mongoose dependencies', () => {
      mockDeps.orm = 'mongoose';
      mockDeps.cronConfigRepository.prototype = {};
      mockDeps.cronJobRepository.prototype = {};
      const result = validateDeps(mockDeps);
      expect(result.databaseOps).toBeInstanceOf(MongooseOperations);
    });
  });

  describe('isJSON', () => {
    it('should return true for valid JSON strings', () => {
      expect(isJSON('{"key": "value"}')).toBe(true);
      expect(isJSON('[1, 2, 3]')).toBe(true);
    });

    it('should return false for invalid JSON strings', () => {
      expect(isJSON('{"key": "value"')).toBe(false);
      expect(isJSON('not a json')).toBe(false);
    });
  });

  describe('intervalToCron', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = new Logger();
      jest.spyOn(logger, 'warn').mockImplementation(() => {});
    });

    it('should return correct cron expression for valid intervals', () => {
      expect(intervalToCron('1s')).toBe('*/1 * * * * *');
      expect(intervalToCron('2s')).toBe('*/2 * * * * *');
    });

    it('should default to 5 seconds for invalid intervals', () => {
      expect(intervalToCron('1m', logger)).toBe('*/5 * * * * *');
      expect(logger.warn).toHaveBeenCalledWith('Invalid interval format. Defaulting to 5 seconds.');
    });

    it('should default to 5 seconds for intervals exceeding 5 seconds', () => {
      expect(intervalToCron('10s', logger)).toBe('*/5 * * * * *');
      expect(logger.warn).toHaveBeenCalledWith(
        'Interval exceeds 5 seconds. Falling back to 5 seconds.',
      );
    });

    it('should default to seconds if unit is not provided', () => {
      expect(intervalToCron('3')).toBe('*/3 * * * * *');
    });

    it('should warn and default to seconds if invalid unit is provided', () => {
      expect(intervalToCron('3m', logger)).toBe('*/5 * * * * *');
      expect(logger.warn).toHaveBeenCalledWith('Invalid interval format. Defaulting to 5 seconds.');
    });
  });

  describe('delay', () => {
    jest.useFakeTimers();

    it('should resolve after the specified time', async () => {
      const delayPromise = delay(1000);
      jest.advanceTimersByTime(1000);
      await expect(delayPromise).resolves.toBeUndefined();
    });
  });
});
