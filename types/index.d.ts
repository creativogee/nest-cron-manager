export class CronManager {
  constructor({
    enabled,
    logger,
    watchTime,
    cronManagerControlRepository,
    cronConfigRepository,
    cronJobRepository,
    redisService,
    orm,
    querySecret,
    entityManager,
    cronJobService,
  }: CronManagerDeps);

  static JobType: Record<string, string>;

  checkInit(): { name: string; status: string }[];
  createCronConfig(data: CreateCronConfig): Promise<{ cronConfig: any }>;
  updateCronConfig(data: UpdateCronConfig): Promise<{ cronConfig: any }>;
  listCronConfig(): Promise<CronConfig[]>;
  toggleCronConfig(id: number | string): Promise<{ cronConfig: any }>;
  enableAllCronConfig(): Promise<{ cronConfigs: CronConfig[] }>;
  disableAllCronConfig(): Promise<{ cronConfigs: CronConfig[] }>;
  getControl(): Promise<CronManagerControl>;
  purgeControl(): Promise<{ success: boolean }>;
  toggleControl(): Promise<{ enabled: boolean }>;

  /**
   * @param name - Must match exactly the name of the caller function in the CronJobService which must also match exactly the name of the cronConfig
   * @param execution - The function to be executed
   * @warning Failure to match these names WILL result in unexpected behavior
   */
  handleJob(
    name: string,
    execution: (context: Record<string, any>, lens: Lens) => Promise<any>,
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

/**
 * The Lens class is used to capture logs, errors, and other data
 */
export class Lens {
  constructor();
  isEmpty: boolean;
  /**
   * @param action - The frame to be captured
   */
  capture(action: Frame): void;
  getFrames(): string;
}

export type JobExecution = (context?: JobContext, lens?: Lens) => Promise<any>;

export interface CronManagerControl {
  /**
   * A flag indicating whether the cron manager is enabled.
   */
  enabled: boolean;
  /**
   * The unique identifier for the CronManagerControl record.
   * Can be a number or string depending on the implementation.
   */
  id: number | string;

  /**
   * A list of replica IDs that are considered stale and require resetting.
   */
  staleReplicas: string[];

  /**
   * A list of IDs representing each replica of the application.
   */
  replicaIds: string[];
  createdAt?: Date;
  updatedAt?: Date;

  /**
   * The cron manager control version (cmcv) used for optimistic concurrency control,
   * ensuring that updates do not conflict with each other.
   */
  cmcv: string;
}

export interface CronConfig {
  /**
   * The unique identifier for the cron configuration.
   * Can be a number or string depending on the implementation.
   */
  id: number | string;

  /**
   * The unique name of the cron job.
   * This must be unique within the system.
   */
  name: string;

  /**
   * The type of job to be executed.
   * Valid options are 'inline', 'method', or 'query'.
   */
  jobType: string;

  /**
   * A flag indicating whether the cron job is enabled.
   * If false, the job will not be executed.
   */
  enabled: boolean;

  /**
   * An optional context for the cron job, which can store additional data or parameters needed for execution.
   * Can be use to inform distributed locking behavior
   */
  context: any | null;

  /**
   * The cron expression that defines the schedule for the job.
   * Can be `null` if not applicable.
   */
  cronExpression: string | null;

  /**
   * The query to be executed if the job type is 'query'.
   * Can be `null` if not applicable.
   */
  query: string | null;

  /**
   * A flag that suppresses logs for this job.
   * When set to `true`, the job will run without generating logs.
   */
  silent: boolean | null;

  /**
   * A timestamp indicating when the cron configuration was soft deleted.
   * Can be `null` if the cron configuration is active.
   */
  deletedAt: Date | null;

  /**
   * An array of `CronJob` instances associated with this configuration.
   */
  jobs: CronJob[];
}

export interface CronJob {
  /**
   * The unique identifier for the cron job instance.
   * Can be a number or string depending on the implementation.
   */
  id: number | string;

  /**
   * The configuration associated with this cron job.
   * This references the `CronConfig` object that defines the job's settings and behavior.
   */
  config: CronConfig;

  /**
   * The result of the cron job execution.
   * Can be `null` if the job hasn't produced a result.
   */
  result: any | null;

  /**
   * The timestamp when the cron job started execution.
   */
  startedAt: Date | null;

  /**
   * The timestamp when the cron job completed successfully.
   * Can be `null` if the job did not failed.
   */
  completedAt: Date | null;

  /**
   * The timestamp when the cron job failed during execution.
   * Can be `null` if the job did not fail.
   */
  failedAt: Date | null;
}

export interface CronManagerDeps {
  /**
   * A unique identifier for the current instance of the cron manager.
   */
  replicaId: string;

  /**
   * An instance of the Logger class, specifically initialized with the name 'CronManager'.
   */
  logger: any;

  /**
   * A repository interface for executing control operations related to cron management.
   */
  cronManagerControlRepository: any;

  /**
   * A repository interface for accessing and managing cron job configuration data.
   */
  cronConfigRepository: any;

  /**
   * A repository interface for handling cron job records and related data.
   */
  cronJobRepository: any;

  /**
   * A service interface for interacting with Redis, used for distributed locking mechanisms.
   */
  redisService: any;

  /**
   * The ORM (Object-Relational Mapper) utilized by your application for database interactions.
   * Supported options are 'typeorm' and 'mongoose'.
   */
  orm: 'typeorm' | 'mongoose';

  /**
   * A service interface for managing cron jobs, necessary when handling `method` type jobs.
   * This field is optional.
   */
  cronJobService?: any;

  /**
   * An EntityManager instance from TypeORM, required for executing `query` type jobs.
   * This field is optional.
   */
  entityManager?: any;

  /**
   * A flag indicating whether the cron manager is active.
   * If not specified, defaults to `false`.
   */
  enabled?: boolean;

  /**
   * The interval at which the replicas are checked for staleness, expressed in seconds.
   * The default value is '1s', with a maximum allowable value of '5s'.
   */
  watchTime?: '1s' | '2s' | '3s' | '4s' | '5s';

  /**
   * A secret key used for encrypting and decrypting queries within the cron manager.
   * This field is optional.
   */
  querySecret?: string;
}

export interface CreateCronManagerControl {
  staleReplicas: string[];
  replicaIds: string[];
  cmcv?: string;
}

export interface UpdateCronManagerControl {
  id: number | string;
  staleReplicas?: string[];
  replicaIds?: string[];
  cmcv?: string;
}

export interface CreateCronConfig {
  name: string;
  context?: any;
  cronExpression?: string;
  jobType?: string; // 'inline' | 'method' | 'query';
  query?: string;
  silent?: boolean;
  enabled: boolean;
}

export interface UpdateCronConfig {
  id: number | string;
  name?: string;
  context?: any;
  cronExpression?: string;
  jobType?: string; // 'inline' | 'method' | 'query';
  query?: string;
  silent?: boolean;
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
  createCronConfig(data: CreateCronConfig): Promise<CronConfig>;
  saveCronConfig(data: CreateCronConfig): Promise<CronConfig>;
  createCronJob(data: any): Promise<CronJob>;
  saveCronJob(data: any): Promise<any>;
  query(sql: string): Promise<any>;
  isTypeOrm(): boolean;
  createControl(options: { replicaId: string }): Promise<CronManagerControl>;
  getControl(): Promise<CronManagerControl | null>;
  updateControl(data: UpdateCronManagerControl): Promise<CronManagerControl>;
}

interface TypeormOperationsDeps {
  cronManagerControlRepository: any;
  cronConfigRepository: any;
  cronJobRepository: any;
  entityManager: any;
  querySecret?: string;
}

interface MongooseOperationsDeps {
  cronManagerControlModel: any;
  cronConfigModel: any;
  cronJobModel: any;
}
