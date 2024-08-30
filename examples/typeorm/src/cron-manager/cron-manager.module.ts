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
import { v4 as uuidv4 } from 'uuid';
import { CronConfig } from './cron-config.model';
import { CronJob } from './cron-job.model';
import { CronJobService } from './cron-job.service';
import { CronManagerControl } from './cron-manager-control.model';
import { CronManagerController } from './cron-manager.controller';

@Module({
  controllers: [CronManagerController],
  imports: [
    TypeOrmModule.forFeature([CronConfig, CronJob, CronManagerControl]),
    CacheModule,
    UserModule,
    forwardRef(() => PostModule),
  ],
  providers: [
    CronJobService,
    {
      provide: CronManager,
      useFactory: async (
        entityManager: EntityManager,
        cronManagerControlRepository: Repository<CronManagerControl>,
        cronConfigRepository: Repository<CronConfig>,
        cronJobRepository: Repository<CronJob>,
        redisService: CacheService,
        cronJobService: CronJobService,
        configService: ConfigService,
      ) => {
        return new CronManager({
          replicaId: uuidv4(),
          enabled: configService.get('app.cronManager.enabled'),
          querySecret: configService.get('app.cronManager.querySecret'),
          logger: new Logger(CronManager.name),
          entityManager,
          cronManagerControlRepository,
          cronConfigRepository,
          cronJobRepository,
          redisService,
          cronJobService,
          orm: 'typeorm',
        });
      },
      inject: [
        getEntityManagerToken(),
        getRepositoryToken(CronManagerControl),
        getRepositoryToken(CronConfig),
        getRepositoryToken(CronJob),
        CacheService,
        CronJobService,
        ConfigService,
      ],
    },
  ],
  exports: [CronManager],
})
export class CronManagerModule {}
