import { registerAs } from '@nestjs/config';
import * as dotenv from 'dotenv';
import { Config } from './config.type';

dotenv.config();

export const config: Config = {
  redisUrl: process.env.REDIS_URL,
  cronManager: {
    enabled: process.env.CRON_MANAGER_ENABLED,
    querySecret: process.env.CRON_MANAGER_QUERY_SECRET,
  },
};

export default registerAs('app', (): Record<string, any> => config);
