import { randomUUID } from 'crypto';
import {
  CreateCronConfig,
  CronConfig,
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
  private configService: any;
  private entityManager: any;
  private querySecret: string;

  constructor({
    cronConfigRepository,
    cronJobRepository,
    configService,
    entityManager,
    cronManagerControlRepository,
    querySecret,
  }: TypeormOperationsDeps) {
    this.cronManagerControlRepository = cronManagerControlRepository;
    this.cronConfigRepository = cronConfigRepository;
    this.cronJobRepository = cronJobRepository;
    this.configService = configService;
    this.entityManager = entityManager;
    this.querySecret = querySecret;
  }

  async createControl(): Promise<CronManagerControl> {
    if (!this.cronManagerControlRepository) {
      throw new Error('CronManager - Control repository not found');
    }
    return this.cronManagerControlRepository.save({ cmcv: randomUUID() });
  }

  async getControl(): Promise<CronManagerControl | null> {
    if (!this.cronManagerControlRepository) {
      throw new Error('CronManager - Control repository not found');
    }

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
    if (!this.cronManagerControlRepository) {
      throw new Error('CronManager - Control repository not found');
    }

    return this.cronManagerControlRepository
      .update({ cmcv: data.cmcv }, { ...data, cmcv: randomUUID() })
      .then(() => this.cronManagerControlRepository.findOne({ where: { cmcv: data.id } }));
  }

  async findOneCronConfig(options: any): Promise<CronConfig | null> {
    return this.cronConfigRepository.findOne(options);
  }

  async findCronConfig(options?: any): Promise<CronConfig[]> {
    return this.cronConfigRepository.find(options);
  }

  createCronConfig(data: CreateCronConfig): CronConfig {
    return this.cronConfigRepository.create(data);
  }

  async saveCronConfig(data: CronConfig): Promise<CronConfig> {
    const querySecret = this.configService?.get('app.cronManager.querySecret') ?? this.querySecret;
    if (data.jobType === 'query') {
      if (!querySecret) {
        throw new Error('CronManager - Query secret not found');
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

  async createControl(): Promise<CronManagerControl> {
    if (!this.cronManagerControlModel) {
      throw new Error('CronManager - Control model not found');
    }
    return this.cronManagerControlModel.create({ cmcv: randomUUID() });
  }

  async getControl(): Promise<CronManagerControl | null> {
    if (!this.cronManagerControlModel) {
      throw new Error('CronManager - Control model not found');
    }

    return this.cronManagerControlModel.findOne();
  }

  async updateControl(data: CronManagerControl): Promise<CronManagerControl> {
    if (!this.cronManagerControlModel) {
      throw new Error('CronManager - Control model not found');
    }

    return this.cronManagerControlModel.findOneAndUpdate(
      { cmcv: data.cmcv },
      { ...data, cmcv: randomUUID() },
      { new: true },
    );
  }

  async findOneCronConfig(options: any): Promise<CronConfig | null> {
    return this.cronConfigModel.findOne(options).exec();
  }

  async findCronConfig(options?: any): Promise<CronConfig[]> {
    return this.cronConfigModel.find(options).exec();
  }

  createCronConfig(data: CreateCronConfig): CronConfig {
    return new this.cronConfigModel(data);
  }

  async saveCronConfig(data: any): Promise<CronConfig> {
    return data.save();
  }

  createCronJob(data: any): any {
    return new this.cronJobModel(data);
  }

  async saveCronJob(data: any): Promise<any> {
    return data.save();
  }

  async query(sql: string): Promise<any> {
    throw new Error('CronManager - Raw SQL queries are not supported in Mongoose');
  }

  isTypeOrm(): boolean {
    return false;
  }
}

export const validateDeps = ({
  cronManagerControlRepository,
  cronConfigRepository,
  cronJobRepository,
  configService,
  ormType,
  logger,
  redisService,
  entityManager,
  querySecret,
}: CronManagerDeps) => {
  if (['typeorm', 'mongoose'].indexOf(ormType) === -1) {
    throw new Error('CronManager - Invalid ORM type');
  }

  if (!logger) {
    throw new Error('CronManager - Logger not provided');
  }

  if (!redisService) {
    throw new Error('CronManager - Redis service not provided');
  }

  if (!cronConfigRepository || !cronJobRepository) {
    throw new Error('CronManager - Repositories not provided');
  }

  let databaseOps: DatabaseOps;

  if (ormType === 'typeorm') {
    if (
      !cronConfigRepository.metadata ||
      !cronJobRepository.metadata ||
      !cronConfigRepository.metadata.connection ||
      !cronJobRepository.metadata.connection
    ) {
      throw new Error('CronManager - Invalid TypeORM repositories');
    }

    databaseOps = new TypeOrmOperations({
      cronManagerControlRepository,
      cronConfigRepository,
      cronJobRepository,
      configService,
      entityManager,
      querySecret,
    });
  }

  if (ormType === 'mongoose') {
    if (!cronConfigRepository.prototype || !cronJobRepository.prototype) {
      throw new Error('CronManager - Invalid Mongoose repositories');
    }

    databaseOps = new MongooseOperations({
      cronManagerControlModel: cronConfigRepository,
      cronConfigModel: cronConfigRepository,
      cronJobModel: cronJobRepository,
    });
  }

  if (!databaseOps) {
    throw new Error('CronManager - Invalid database operations');
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
