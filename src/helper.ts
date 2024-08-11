import {
  CreateCronConfig,
  CronConfig,
  CronManagerDeps,
  DatabaseOps,
  MongooseOperationsDeps,
  TypeormOperationsDeps,
} from '../types';

export class TypeOrmOperations implements DatabaseOps {
  private cronConfigRepository: any;
  private cronJobRepository: any;
  private configService: any;

  constructor({ cronConfigRepository, cronJobRepository, configService }: TypeormOperationsDeps) {
    this.cronConfigRepository = cronConfigRepository;
    this.cronJobRepository = cronJobRepository;
    this.configService = configService;
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
    // before saving encrypt the query
    const querySecret = this.configService.get('app.cronManager.querySecret');
    if (data.jobType === 'query') {
      if (!querySecret) {
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
    return this.cronConfigRepository.query(sql);
  }

  isTypeOrm(): boolean {
    return true;
  }
}

export class MongooseOperations implements DatabaseOps {
  private cronConfigModel: any;
  private cronJobModel: any;
  private configService: any;

  constructor({ cronConfigModel, cronJobModel, configService }: MongooseOperationsDeps) {
    this.cronConfigModel = cronConfigModel;
    this.cronJobModel = cronJobModel;
    this.configService = configService;
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
    throw new Error('Raw SQL queries are not supported in Mongoose');
  }

  isTypeOrm(): boolean {
    return false;
  }
}

export const validateRepos = ({
  cronConfigRepository,
  cronJobRepository,
  configService,
  ormType,
}: Partial<CronManagerDeps>) => {
  if (['typeorm', 'mongoose'].indexOf(ormType) === -1) {
    throw new Error('Invalid ORM type');
  }

  if (!configService) {
    throw new Error('Config service not provided');
  }

  if (!cronConfigRepository || !cronJobRepository) {
    throw new Error('Repositories not provided');
  }

  let databaseOps: DatabaseOps;

  if (ormType === 'typeorm') {
    if (
      !cronConfigRepository.metadata ||
      !cronJobRepository.metadata ||
      !cronConfigRepository.metadata.connection ||
      !cronJobRepository.metadata.connection
    ) {
      throw new Error('Invalid TypeORM repositories');
    }

    databaseOps = new TypeOrmOperations({ cronConfigRepository, cronJobRepository, configService });
  }

  if (ormType === 'mongoose') {
    if (!cronConfigRepository.prototype || !cronJobRepository.prototype) {
      throw new Error('Invalid Mongoose repositories');
    }

    databaseOps = new MongooseOperations({
      cronConfigModel: cronConfigRepository,
      cronJobModel: cronJobRepository,
      configService,
    });
  }

  if (!databaseOps) {
    throw new Error('Invalid database operations');
  }

  return databaseOps;
};
