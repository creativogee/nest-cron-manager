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

export interface CronConfig {
  id: number;
  name: string;
  context?: any;
  enabled: boolean;
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
}

export interface CreateCronConfig {
  name: string;
  context?: any;
  enabled: boolean;
}

export interface UpdateCronConfig {
  id: number;
  name?: string;
  context?: any;
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
