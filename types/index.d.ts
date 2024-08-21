export class CronManager {
  constructor({
    logger,
    cronConfigRepository,
    cronJobRepository,
    redisService,
    ormType,
    entityManager,
  }: CronManagerDeps);

  static JobType: Record<string, string>;

  checkInit(): { name: string; status: string }[];
  createCronConfig(data: CreateCronConfig): Promise<{ cronConfig: any }>;
  updateCronConfig(data: UpdateCronConfig): Promise<{ cronConfig: any }>;
  listCronConfig(): Promise<CronConfig[]>;
  toggleCronConfig(id: number): Promise<{ cronConfig: any }>;
  enableAllCronConfig(): Promise<{ cronConfigs: CronConfig[] }>;
  disableAllCronConfig(): Promise<{ cronConfigs: CronConfig[] }>;

  /**
   * @param name - Must match exactly the name of the caller function in the CronJobService which must also match exactly the name of the cronConfig
   * @param execution - The function to be executed
   * @warning Failure to match these names WILL result in unexpected behavior
   */
  handleJob(
    name: string,
    execution: (
      context: Record<string, any>,
      config: Record<string, any>,
      lens: Lens,
    ) => Promise<any>,
  ): Promise<void>;
}
/**
 * This function binds all class methods to the class instance
 */
export function bindMethods(instance: any): void;

export interface Frame {
  title: string;
  message?: string;
  [key: string]: any;
}

export class Lens {
  constructor();
  isEmpty: boolean;
  capture(action: Frame): void;
  getFrames(): string;
}

export type JobExecution = (
  context?: JobContext,
  config?: Record<string, any>,
  lens?: Lens,
) => Promise<any>;

export interface CronManagerControl {
  id: number;
  reset: boolean;
  resetCount: number;
  createdAt: Date;
  updatedAt: Date;
  cmcv: string;
}

export interface CronConfig {
  id: number;
  name: string;
  jobType: string; // 'inline' | 'method' | 'query';
  enabled: boolean;
  context: any | null;
  cronExpression: string | null;
  query: string | null;
  dryRun: boolean | null;
  deletedAt: Date | null;
  jobs: CronJob[];
}

export interface CronJob {
  id: number;
  config: CronConfig;
  result: any | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
}

export interface CronManagerDeps {
  logger: any;
  cronManagerControlRepository?: any;
  configService?: any;
  cronConfigRepository: any;
  cronJobRepository: any;
  redisService: any;
  ormType: 'typeorm' | 'mongoose';
  cronJobService?: any;
  entityManager?: any; // for typeorm only
  enabled?: boolean;
  appCount?: number; // default 1
  watchTime?: string; // '* * * * * *'
  querySecret?: string;
}

export interface CreateCronManagerControl {
  reset?: boolean;
  resetCount?: number;
  cmcv?: string;
}

export interface UpdateCronManagerControl {
  id: number;
  reset?: boolean;
  resetCount?: number;
  cmcv?: string;
}

export interface CreateCronConfig {
  name: string;
  context?: any;
  cronExpression?: string;
  jobType?: string; // 'inline' | 'method' | 'query';
  query?: string;
  dryRun?: boolean;
  enabled: boolean;
}

export interface UpdateCronConfig {
  id: number;
  name?: string;
  context?: any;
  cronExpression?: string;
  jobType?: string; // 'inline' | 'method' | 'query';
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
  findCronConfig(options?: any): Promise<CronConfig[]>;
  createCronConfig(data: CreateCronConfig): CronConfig;
  saveCronConfig(data: CreateCronConfig): Promise<CronConfig>;
  createCronJob(data: any): CronJob;
  saveCronJob(data: any): Promise<any>;
  query(sql: string): Promise<any>;
  isTypeOrm(): boolean;
  createControl(): Promise<CronManagerControl>;
  getControl(): Promise<CronManagerControl | null>;
  updateControl(data: UpdateCronManagerControl): Promise<CronManagerControl>;
}

interface TypeormOperationsDeps {
  cronManagerControlRepository?: any;
  cronConfigRepository: any;
  cronJobRepository: any;
  entityManager: any;
  querySecret?: string;
  configService: any;
}

interface MongooseOperationsDeps {
  cronManagerControlModel: any;
  cronConfigModel: any;
  cronJobModel: any;
}
