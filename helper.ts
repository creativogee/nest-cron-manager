import { CreateCronConfig, CronConfig, CronManagerDeps, DatabaseOps } from './types';

export class TypeOrmOperations implements DatabaseOps {
  constructor(private cronConfigRepository: any, private cronJobRepository: any) {}

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
  constructor(private CronConfigModel: any, private CronJobModel: any) {}

  async findOneCronConfig(options: any): Promise<CronConfig | null> {
    return this.CronConfigModel.findOne(options).exec();
  }

  async findCronConfigs(options?: any): Promise<CronConfig[]> {
    return this.CronConfigModel.find(options).exec();
  }

  createCronConfig(data: CreateCronConfig): CronConfig {
    return new this.CronConfigModel(data);
  }

  async saveCronConfig(data: any): Promise<CronConfig> {
    return data.save();
  }

  createCronJob(data: any): any {
    return new this.CronJobModel(data);
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
  ormType,
}: Partial<CronManagerDeps>) => {
  if (['typeorm', 'mongoose'].indexOf(ormType) === -1) {
    throw new Error('Invalid ORM type');
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

    databaseOps = new TypeOrmOperations(cronConfigRepository, cronJobRepository);
  }

  if (ormType === 'mongoose') {
    if (!cronConfigRepository.prototype || !cronJobRepository.prototype) {
      throw new Error('Invalid Mongoose repositories');
    }

    databaseOps = new MongooseOperations(cronConfigRepository, cronJobRepository);
  }

  if (!databaseOps) {
    throw new Error('Invalid database operations');
  }

  return databaseOps;
};
