import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from './cache/cache.module';
import appConfig from './configs/app.config';
import { CronConfigController } from './cron/cron-config.controller';
import { CronModule } from './cron/cron.module';
import { DatabaseModule } from './database/database.module';
import typeormConfig from './database/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    CronModule,
    CacheModule,
    DatabaseModule,
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      load: [appConfig, typeormConfig],
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      expandVariables: true,
    }),
  ],
  controllers: [CronConfigController],
})
export class AppModule {}
