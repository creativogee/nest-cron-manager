import { DatabaseModule } from '@/database/database.module';
import { PostModule } from '@/post/post.module';
import { UserModule } from '@/user/user.module';
import { forwardRef, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CronManager } from 'nest-cron-manager';
import { CacheModule } from '../cache/cache.module';
import { CacheService } from '../cache/cache.service';
import { CronConfig } from './cron-config.model';
import { CronJob } from './cron-job.model';
import { CronJobService } from './cron-job.service';
import { CronManagerControl } from './cron-manager-control.model';
import { CronManagerController } from './cron-manager.controller';

@Module({
  controllers: [CronManagerController],
  imports: [
    DatabaseModule,
    UserModule,
    CacheModule,
    forwardRef(() => PostModule),
  ],
  providers: [
    CronJobService,
    {
      provide: CronManager,
      useFactory: async (
        cronManagerControlRepository: Model<CronManagerControl>,
        cronConfigModel: Model<CronConfig>,
        cronJobModel: Model<CronJob>,
        configService: ConfigService,
        redisService: CacheService,
        cronJobService: CronJobService,
      ) =>
        new CronManager({
          enabled: configService.get('app.cronManager.enabled'),
          replicaId: configService.get('app.cronManager.replicaId'),
          querySecret: configService.get('app.cronManager.querySecret'),
          logger: new Logger(CronManager.name),
          cronManagerControlRepository: cronManagerControlRepository,
          cronConfigRepository: cronConfigModel,
          cronJobRepository: cronJobModel,
          redisService,
          cronJobService,
          orm: 'mongoose',
        }),
      inject: [
        getModelToken(CronManagerControl.name),
        getModelToken(CronConfig.name),
        getModelToken(CronJob.name),
        ConfigService,
        CacheService,
        CronJobService,
      ],
    },
  ],
  exports: [CronManager],
})
export class CronManagerModule {}
