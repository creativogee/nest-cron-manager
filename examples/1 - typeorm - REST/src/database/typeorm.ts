import { registerAs } from '@nestjs/config';
import { DataSource, DataSourceOptions } from 'typeorm';

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env' });

const config = {
  type: 'postgres',
  host: `${process.env.PG_HOST}`,
  port: parseInt(`${process.env.PG_PORT}`, 10),
  username: `${process.env.PG_USER}`,
  password: `${process.env.PG_PASSWORD}`,
  database: `${process.env.PG_DATABASE}`,
  entities: ['dist/**/*.model{.ts,.js}'],
  migrations: ['dist/database/migrations/*{.ts,.js}'],
  synchronize: false,
} satisfies DataSourceOptions;

export default registerAs('typeorm', () => config);
export const connectionSource = new DataSource(config);
