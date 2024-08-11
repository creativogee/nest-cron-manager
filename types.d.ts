export class CronManager {
  constructor({
    logger,
    configService,
    cronConfigRepository,
    cronJobRepository,
    redisService,
  }: {
    logger: any;
    configService: any;
    cronConfigRepository: any;
    cronJobRepository: any;
    redisService: any;
  });

  checkInit(): boolean;
  createCronConfig(data: CreateCronConfig): Promise<{ cronConfig: any }>;
  updateCronConfig(data: UpdateCronConfig): Promise<{ cronConfig: any }>;
  handleJob(
    name: string,
    callback: (context: {}, config: Record<string, any>) => Promise<any>,
  ): Promise<void>;
}

export type JobExecution = (context?: JobContext, config?: Record<string, any>) => Promise<any>;

export interface CronConfig {
  id: number;
  name: string;
  jobType: string; // 'callback' | 'method' | 'query';
  enabled: boolean;
  context?: any;
  cronExpression?: string;
  query?: string;
  dryRun?: boolean;
  deletedAt?: Date;
  jobs: CronJob[];
}

export interface CronJob {
  id: number;
  config: CronConfig;
  result?: any;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
}

export interface CronManagerDeps {
  logger: any;
  configService: any;
  cronConfigRepository: any;
  cronJobRepository: any;
  redisService: any;
  cronJobService?: any;
  ormType: 'typeorm' | 'mongoose';
}

export interface CreateCronConfig {
  name: string;
  context?: any;
  cronExpression?: string;
  jobType?: string; // 'callback' | 'method' | 'query';
  query?: string;
  dryRun?: boolean;
  enabled: boolean;
}

export interface UpdateCronConfig {
  id: number;
  name?: string;
  context?: any;
  cronExpression?: string;
  jobType?: string; // 'callback' | 'method' | 'query';
  query?: string;
  dryRun?: boolean;
  enabled?: boolean;
}

export interface EndJob {
  job: CronJob;
  status: 'Success' | 'Failed';
  result?: any;
}

export interface JobContext {
  distributed?: boolean;
  ttl?: number;
}

interface DatabaseOps {
  findOneCronConfig(options: any): Promise<CronConfig | null>;
  findCronConfigs(options?: any): Promise<CronConfig[]>;
  createCronConfig(data: CreateCronConfig): CronConfig;
  saveCronConfig(data: CreateCronConfig): Promise<CronConfig>;
  createCronJob(data: any): CronJob;
  saveCronJob(data: any): Promise<any>;
  query(sql: string): Promise<any>;
  isTypeOrm(): boolean;
}

interface TypeormOperationsDeps {
  cronConfigRepository: any;
  cronJobRepository: any;
  configService: any;
}

interface MongooseOperationsDeps {
  cronConfigModel: any;
  cronJobModel: any;
  configService: any;
}
