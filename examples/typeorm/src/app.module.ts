import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from './cache/cache.module';
import appConfig from './configs/app.config';
import { CronManagerController } from './cron-manager/cron-manager.controller';
import { CronManagerModule } from './cron-manager/cron-manager.module';
import { DatabaseModule } from './database/database.module';
import typeormConfig from './database/typeorm';

@Module({
  imports: [
    CronManagerModule,
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
  controllers: [CronManagerController],
})
export class AppModule {}
