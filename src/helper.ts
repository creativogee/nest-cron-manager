import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CreateCronConfig,
  CronConfig,
  CronJob,
  CronManagerControl,
  CronManagerDeps,
  DatabaseOps,
  MongooseOperationsDeps,
  TypeormOperationsDeps,
} from '../types';

export class TypeOrmOperations implements DatabaseOps {
  private cronManagerControlRepository: any;
  private cronConfigRepository: any;
  private cronJobRepository: any;
  private entityManager: any;
  private querySecret: string;

  constructor({
    cronConfigRepository,
    cronJobRepository,
    entityManager,
    cronManagerControlRepository,
    querySecret,
  }: TypeormOperationsDeps) {
    this.cronManagerControlRepository = cronManagerControlRepository;
    this.cronConfigRepository = cronConfigRepository;
    this.cronJobRepository = cronJobRepository;
    this.entityManager = entityManager;
    this.querySecret = querySecret;
  }

  async createControl({ replicaId }): Promise<CronManagerControl> {
    return this.cronManagerControlRepository.save({ cmcv: randomUUID(), replicaIds: [replicaId] });
  }

  async getControl(): Promise<CronManagerControl | null> {
    return this.cronManagerControlRepository
      .find({
        order: {
          createdAt: 'DESC',
        },
      })
      .then((controls: CronManagerControl[]) => {
        return controls.length ? controls[0] : null;
      });
  }

  async updateControl(data: CronManagerControl): Promise<CronManagerControl> {
    const found = await this.cronManagerControlRepository
      .update({ cmcv: data.cmcv }, { ...data, cmcv: randomUUID() })
      .then((updated) => {
        if (updated.affected) {
          return this.cronManagerControlRepository.find();
        }
      });

    if (found?.length) {
      return found[0];
    }
  }

  async findOneCronConfig(options: any): Promise<CronConfig | null> {
    return this.cronConfigRepository.findOne({
      where: options,
    });
  }

  async findCronConfig(options?: any): Promise<CronConfig[]> {
    return this.cronConfigRepository.find({
      where: options,
    });
  }

  createCronConfig(data: CreateCronConfig): CronConfig {
    return this.cronConfigRepository.create(data);
  }

  async saveCronConfig(data: CronConfig): Promise<CronConfig> {
    if (data.jobType === 'query') {
      if (!this.querySecret) {
        throw new Error('Query secret not found');
      }
    }
    return this.cronConfigRepository.save(data);
  }

  createCronJob(data: any): any {
    return this.cronJobRepository.create(data);
  }

  async saveCronJob(data: any): Promise<any> {
    return this.cronJobRepository.save(data);
  }

  async query(sql: string): Promise<any> {
    return this.entityManager.query(sql);
  }

  isTypeOrm(): boolean {
    return true;
  }
}

export class MongooseOperations implements DatabaseOps {
  private cronManagerControlModel: any;
  private cronConfigModel: any;
  private cronJobModel: any;

  constructor({ cronConfigModel, cronJobModel, cronManagerControlModel }: MongooseOperationsDeps) {
    this.cronManagerControlModel = cronManagerControlModel;
    this.cronConfigModel = cronConfigModel;
    this.cronJobModel = cronJobModel;
  }

  async createControl({ replicaId }): Promise<CronManagerControl> {
    return this.cronManagerControlModel.create({ cmcv: randomUUID(), replicaIds: [replicaId] });
  }

  async getControl(): Promise<CronManagerControl | null> {
    return this.cronManagerControlModel.findOne();
  }

  async updateControl(data: CronManagerControl): Promise<CronManagerControl> {
    const cmcv = data.cmcv;
    data.cmcv = randomUUID();

    return this.cronManagerControlModel.findOneAndUpdate({ cmcv }, data, { new: true });
  }

  async findOneCronConfig(options: any): Promise<CronConfig | null> {
    if (options?.id) {
      options._id = options.id;
      delete options.id;
    }

    return this.cronConfigModel.findOne(options).exec();
  }

  async findCronConfig(options?: any): Promise<CronConfig[]> {
    if (options?.id) {
      options._id = options.id;
      delete options.id;
    }

    return this.cronConfigModel.find(options).exec();
  }

  createCronConfig(data: CreateCronConfig): CronConfig {
    return this.cronConfigModel.create(data);
  }

  async saveCronConfig({ id, ...data }: any): Promise<CronConfig> {
    delete data.deletedAt;

    const cronConfig = await this.cronConfigModel.findOne({ _id: id }).exec();

    if (!cronConfig) {
      return this.cronConfigModel.create(data);
    }

    Object.assign(cronConfig, data);

    return cronConfig.save();
  }

  async createCronJob({ config, ...data }: any): Promise<CronJob> {
    data.configId = config.id;

    return this.cronJobModel.create(data);
  }

  async saveCronJob({ id, ...data }: any): Promise<CronJob> {
    delete data.deletedAt;

    const cronJob = await this.cronJobModel.findOne({ _id: id }).exec();

    if (!cronJob) {
      return this.cronJobModel.create(data);
    }

    Object.assign(cronJob, data);

    return cronJob.save();
  }

  async query(sql: string): Promise<any> {
    throw new Error('Raw SQL queries are not supported in Mongoose');
  }

  isTypeOrm(): boolean {
    return false;
  }
}

export const validateDeps = ({
  cronManagerControlRepository,
  cronConfigRepository,
  cronJobRepository,
  orm,
  logger,
  redisService,
  entityManager,
  querySecret,
}: CronManagerDeps) => {
  if (!cronManagerControlRepository) {
    throw new Error('Control repository not provided');
  }

  if (['typeorm', 'mongoose'].indexOf(orm) === -1) {
    throw new Error('Invalid ORM type');
  }

  if (!logger) {
    throw new Error('Logger not provided');
  }

  if (!redisService) {
    throw new Error('Redis service not provided');
  }

  if (!cronConfigRepository || !cronJobRepository) {
    throw new Error('Repositories not provided');
  }

  let databaseOps: DatabaseOps;

  if (orm === 'typeorm') {
    if (
      !cronConfigRepository.metadata ||
      !cronJobRepository.metadata ||
      !cronConfigRepository.metadata.connection ||
      !cronJobRepository.metadata.connection
    ) {
      throw new Error('Invalid TypeORM repositories');
    }

    databaseOps = new TypeOrmOperations({
      cronManagerControlRepository,
      cronConfigRepository,
      cronJobRepository,
      entityManager,
      querySecret,
    });
  }

  if (orm === 'mongoose') {
    if (!cronConfigRepository.prototype || !cronJobRepository.prototype) {
      throw new Error('Invalid Mongoose repositories');
    }

    databaseOps = new MongooseOperations({
      cronManagerControlModel: cronManagerControlRepository,
      cronConfigModel: cronConfigRepository,
      cronJobModel: cronJobRepository,
    });
  }

  if (!databaseOps) {
    throw new Error('Invalid database operations');
  }

  return { databaseOps };
};

export const isJSON = (str: string): boolean => {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
};

export const intervalToCron = (interval: string, logger?: Logger): string => {
  // Updated regex to match numbers with optional 's' for seconds
  const match = /^(\d+)(s?)$/.exec(interval);
  if (!match) {
    logger?.warn('Invalid interval format. Defaulting to 5 seconds.');
    return '*/5 * * * * *';
  }

  let value = parseInt(match[1], 10);
  const unit = match[2] || 's'; // Default to 's' if unit is not provided

  if (unit !== 's') {
    logger?.warn('Invalid unit provided. Defaulting to seconds.');
  }

  // Ensure the value does not exceed 5 seconds
  if (value > 5) {
    logger?.warn('Interval exceeds 5 seconds. Falling back to 5 seconds.');
    value = 5;
  }

  // Return the cron expression for seconds
  return `*/${value} * * * * *`;
};

export const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
