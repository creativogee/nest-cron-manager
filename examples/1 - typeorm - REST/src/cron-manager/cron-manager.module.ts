import { CacheModule } from '@/cache/cache.module';
import { CacheService } from '@/cache/cache.service';
import { PostModule } from '@/post/post.module';
import { UserModule } from '@/user/user.module';
import { forwardRef, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  getEntityManagerToken,
  getRepositoryToken,
  TypeOrmModule,
} from '@nestjs/typeorm';
import { CronManager } from 'nest-cron-manager';
import { EntityManager, Repository } from 'typeorm';
import { CronConfigController } from './cron-config.controller';
import { CronConfig } from './cron-config.model';
import { CronJob } from './cron-job.model';
import { CronJobService } from './cron-job.service';

@Module({
  controllers: [CronConfigController],
  imports: [
    TypeOrmModule.forFeature([CronConfig, CronJob]),
    forwardRef(() => PostModule),
    CacheModule,
    UserModule,
  ],
  providers: [
    CronJobService,
    {
      provide: CronManager,
      useFactory: async (
        cronConfigRepository: Repository<CronConfig>,
        cronJobRepository: Repository<CronJob>,
        configService: ConfigService,
        redisService: CacheService,
        cronJobService: CronJobService,
        entityManager: EntityManager,
      ) => {
        return new CronManager({
          logger: new Logger(CronManager.name),
          configService,
          cronConfigRepository,
          cronJobRepository,
          redisService,
          cronJobService,
          entityManager,
          ormType: 'typeorm',
        });
      },
      inject: [
        getRepositoryToken(CronConfig),
        getRepositoryToken(CronJob),
        ConfigService,
        CacheService,
        CronJobService,
        getEntityManagerToken(),
      ],
    },
  ],
  exports: [CronManager],
})
export class CronManagerModule {}
