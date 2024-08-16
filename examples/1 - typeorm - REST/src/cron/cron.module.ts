import { CacheModule } from '@/cache/cache.module';
import { CacheService } from '@/cache/cache.service';
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { CronManager } from 'nest-cron-manager';
import { Repository } from 'typeorm';
import { CronConfigController } from './cron-config.controller';
import { CronConfig } from './cron-config.model';
import { CronJob } from './cron-job.model';
import { CronJobService } from './cron-job.service';

@Module({
  controllers: [CronConfigController],
  imports: [TypeOrmModule.forFeature([CronConfig, CronJob]), CacheModule],
  providers: [
    CronJobService,
    {
      provide: CronManager,
      useFactory: async (
        cronConfigRepository: Repository<CronConfig>,
        cronJobRepository: Repository<CronJob>,
        configService: ConfigService,
        redisService: CacheService,
      ) => {
        return new CronManager({
          logger: new Logger(CronManager.name),
          configService,
          cronConfigRepository,
          cronJobRepository,
          redisService,
          ormType: 'typeorm',
        });
      },
      inject: [
        getRepositoryToken(CronConfig),
        getRepositoryToken(CronJob),
        ConfigService,
        CacheService,
      ],
    },
  ],
  exports: [CronManager],
})
export class CronModule {}
