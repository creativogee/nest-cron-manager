import {
  CreateCronConfig,
  CronConfig,
  CronManagerDeps,
  DatabaseOps,
  Frame,
  MongooseOperationsDeps,
  TypeormOperationsDeps,
} from '../types';

export class TypeOrmOperations implements DatabaseOps {
  private cronConfigRepository: any;
  private cronJobRepository: any;
  private configService: any;
  private queryRunner: any;

  constructor({
    cronConfigRepository,
    cronJobRepository,
    configService,
    queryRunner,
  }: TypeormOperationsDeps) {
    this.cronConfigRepository = cronConfigRepository;
    this.cronJobRepository = cronJobRepository;
    this.configService = configService;
    this.queryRunner = queryRunner;
  }

  async findOneCronConfig(options: any): Promise<CronConfig | null> {
    return this.cronConfigRepository.findOne(options);
  }

  async findCronConfigs(options?: any): Promise<CronConfig[]> {
    return this.cronConfigRepository.find(options);
  }

  createCronConfig(data: CreateCronConfig): CronConfig {
    return this.cronConfigRepository.create(data);
  }

  async saveCronConfig(data: CronConfig): Promise<CronConfig> {
    const querySecret = this.configService.get('app.cronManager.querySecret');

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
    return this.queryRunner(sql);
  }

  isTypeOrm(): boolean {
    return true;
  }
}

export class MongooseOperations implements DatabaseOps {
  private cronConfigModel: any;
  private cronJobModel: any;

  constructor({ cronConfigModel, cronJobModel }: MongooseOperationsDeps) {
    this.cronConfigModel = cronConfigModel;
    this.cronJobModel = cronJobModel;
  }

  async findOneCronConfig(options: any): Promise<CronConfig | null> {
    return this.cronConfigModel.findOne(options).exec();
  }

  async findCronConfigs(options?: any): Promise<CronConfig[]> {
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
  cronConfigRepository,
  cronJobRepository,
  configService,
  ormType,
  logger,
  redisService,
  queryRunner,
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

  if (!configService) {
    throw new Error('CronManager - Config service not provided');
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
      cronConfigRepository,
      cronJobRepository,
      configService,
      queryRunner,
    });
  }

  if (ormType === 'mongoose') {
    if (!cronConfigRepository.prototype || !cronJobRepository.prototype) {
      throw new Error('CronManager - Invalid Mongoose repositories');
    }

    databaseOps = new MongooseOperations({
      cronConfigModel: cronConfigRepository,
      cronJobModel: cronJobRepository,
    });
  }

  if (!databaseOps) {
    throw new Error('CronManager - Invalid database operations');
  }

  return { databaseOps };
};

export class Lens {
  private frames: Frame[] = [];

  capture(action: Frame) {
    this.frames.push(action);
  }

  getFrames() {
    return JSON.stringify(this.frames);
  }
}
