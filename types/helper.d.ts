import { CreateCronConfig, CronConfig, CronManagerDeps, DatabaseOps, MongooseOperationsDeps, TypeormOperationsDeps } from '../types';
export declare class TypeOrmOperations implements DatabaseOps {
    private cronConfigRepository;
    private cronJobRepository;
    private configService;
    constructor({ cronConfigRepository, cronJobRepository, configService }: TypeormOperationsDeps);
    findOneCronConfig(options: any): Promise<CronConfig | null>;
    findCronConfigs(options?: any): Promise<CronConfig[]>;
    createCronConfig(data: CreateCronConfig): CronConfig;
    saveCronConfig(data: CronConfig): Promise<CronConfig>;
    createCronJob(data: any): any;
    saveCronJob(data: any): Promise<any>;
    query(sql: string): Promise<any>;
    isTypeOrm(): boolean;
}
export declare class MongooseOperations implements DatabaseOps {
    private cronConfigModel;
    private cronJobModel;
    private configService;
    constructor({ cronConfigModel, cronJobModel, configService }: MongooseOperationsDeps);
    findOneCronConfig(options: any): Promise<CronConfig | null>;
    findCronConfigs(options?: any): Promise<CronConfig[]>;
    createCronConfig(data: CreateCronConfig): CronConfig;
    saveCronConfig(data: any): Promise<CronConfig>;
    createCronJob(data: any): any;
    saveCronJob(data: any): Promise<any>;
    query(sql: string): Promise<any>;
    isTypeOrm(): boolean;
}
export declare const validateRepos: ({ cronConfigRepository, cronJobRepository, configService, ormType, }: Partial<CronManagerDeps>) => DatabaseOps;
