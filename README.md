<h1 align="center">
  nest-cron-manager
</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/nest-cron-manager"><img alt="NPM version" src="https://img.shields.io/npm/v/nest-cron-manager.svg"></a>
  <a href="https://www.npmjs.com/package/nest-cron-manager"><img alt="NPM downloads" src="https://img.shields.io/npm/dw/nest-cron-manager.svg"></a>
  <a href="https://www.paypal.com/donate?hosted_button_id=Z9NGDEGSC3LPY" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"></a>
</p>

## Overview

This project, `nest-cron-manager`, is a TypeScript-based library designed to manage and execute cron jobs efficiently within a NestJS application. It provides a robust interface for scheduling, executing, and logging cron jobs, with support for Redis-based locking mechanisms to ensure job execution integrity. The library leverages ORM frameworks like TypeORM or Mongoose for database operations and is designed to be extensible, allowing for easy integration with other ORMs in the future. It integrates seamlessly with NestJS's dependency injection system.

## Installation

To install, use:

```sh
npm install nest-cron-manager

# OR

yarn add nest-cron-manager
```

## Getting Started

#### For TypeORM:

```sh
npm install ioredis typeorm @nestjs/schedule @nestjs/typeorm pg
```

#### For Mongoose:

_See the [repository](https://github.com/creativogee/nest-cron-manager/tree/main/examples) for mongoose example_

```sh
npm install ioredis @nestjs/schedule @nestjs/mongoose mongoose
```

### Models

Create `CronManagerControl`, `CronConfig` and `CronJob` models which implement the `CronManagerControlInterface`, `CronConfigInterface` and `CronJobInterface` respectively.

```typescript
// src/cron-manager/cron-manager-control.model.ts

import { CronManagerControl as CronManagerControlInterface } from 'nest-cron-manager/types';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('cron_manager_control')
export class CronManagerControl implements CronManagerControlInterface {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ default: true })
  enabled: boolean;

  @Column({ nullable: true })
  logLevel: string;

  @Column('jsonb', { default: [] })
  replicaIds: string[];

  @Column('jsonb', { default: [] })
  staleReplicas: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column()
  cmcv: string;
}
```

```typescript
// src/cron-manager/cron-config.model.ts

import { CronManager } from 'nest-cron-manager';
import {
  CronConfig as CronConfigInterface,
  CronJob as CronJobInterface,
} from 'nest-cron-manager/types';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { CronJob } from './cron-job.model';

@Entity({ name: 'cron_configs' })
export class CronConfig implements CronConfigInterface {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true, default: CronManager.JobType.INLINE })
  jobType: string;

  @Column({ default: false })
  enabled: boolean;

  @Column({ nullable: true, type: 'jsonb' })
  context: any;

  @Column({ nullable: true })
  cronExpression: string;

  @Column({ nullable: true })
  query: string;

  @Column({ nullable: true, default: false })
  silent: boolean;

  @Column({ nullable: true })
  deletedAt: Date;

  @OneToMany(() => CronJob, (cronJob) => cronJob.config)
  jobs: CronJobInterface[];
}
```

```typescript
// src/cron-manager/cron-job.model.ts

import {
  CronConfig as CronConfigInterface,
  CronJob as CronJobInterface,
} from 'nest-cron-manager/types';
import { Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CronConfig } from './cron-config.model';

@Entity({ name: 'cron_jobs' })
export class CronJob implements CronJobInterface {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @ManyToOne(() => CronConfig, (config) => config.jobs)
  config: CronConfigInterface;

  @Column({ nullable: true, type: 'jsonb' })
  result: any;

  @Column()
  startedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @Column({ nullable: true })
  failedAt: Date;
}
```

### Controller

Create `CronManagerController` to handle the creation and updating of cron config and more. You may implement whatever network and serialization protocol you wish.
The underlying data tables and their records are fully under your control, allowing you to interact with them as you see fit.
However, it is recommended to maintain the schema and in certain cases, as you will see below, to use library-provided methods.

```typescript
// src/cron-manager/cron-config.controller.ts

import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CreateCronConfig, CronManager, UpdateCronConfig } from 'nest-cron-manager';

@Controller()
export class CronManagerController {
  constructor(private readonly cronManager: CronManager) {}

  @Post('/cron/config')
  async createCronConfig(@Body() body: CreateCronConfig) {
    return this.cronManager.createCronConfig(body);
  }

  @Put('/cron/config/:id')
  async updateCronConfig(@Body() body: UpdateCronConfig, @Param('id') id: string) {
    return this.cronManager.updateCronConfig({ ...body, id: +id });
  }

  // More endpoints:
  // GET /cron/config - List all cron configs
  // PUT /cron/config/:id/toggle - Toggle on/off a cron config
  // PUT /cron/config/disable-all - Disable all cron configs
  // PUT /cron/config/enable-all - Enable all cron configs
  // GET /cmc - Get cron manager control
  // DELETE /cmc - Purge cron manager control
  // PATCH /cmc - Toggle cron manager control
}
```

### Service

Create a `CacheService` in your project and ensure it implements a `getClient` method.

```typescript
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleDestroy {
  private client: Redis;

  constructor(private readonly config: ConfigService) {
    this.client = new Redis(this.config.get('app.redisUrl'));
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  getClient(): Redis {
    return this.client;
  }
}
```

### Module

Create an instance of CronManager by passing the required dependencies specified in `CronManagerDeps`:

```typescript
// src/cron-manager/cron-manager.module.ts

import { CacheModule } from '@/cache/cache.module';
import { CacheService } from '@/cache/cache.service';
import { PostModule } from '@/post/post.module';
import { UserModule } from '@/user/user.module';
import { forwardRef, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getEntityManagerToken, getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { CronManager } from 'nest-cron-manager';
import { v4 as uuidv4 } from 'uuid';
import { EntityManager, Repository } from 'typeorm';
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
    // Be mindful of circular dependencies for modules
    // which import the CronManagerModule
    forwardRef(() => ProductModule),
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
```

### CronManager Dependencies

| Dependency                   | Description                                                               | Required |
| ---------------------------- | ------------------------------------------------------------------------- | -------- |
| replicaId                    | A unique identifier for every application replica                         | true     |
| enabled                      | A boolean value indicating whether the cron manager is enabled            | true     |
| querySecret                  | A secret value for encrypting and decrypting queries                      | false    |
| logger                       | An instance of the Logger class, initialized with the name of CronManager | true     |
| entityManager                | A `typeorm` entity manager requred for running `query` job types          | false    |
| cronManagerControlRepository | A repository for managing cron manager control data                       | true     |
| cronConfigRepository         | A repository for managing cron configuration data                         | true     |
| cronJobRepository            | A repository for managing cron job data                                   | true     |
| redisService                 | A service for interacting with Redis. Required for distributed locking    | false    |
| cronJobService               | A service for managing cron jobs. Required for `method` job types         | false    |
| watchTime                    | The cron manager control (cmc) watch time.                                | false    |
| orm                          | The ORM to use for database operations                                    | true     |

### Executing cron jobs

Depending on the specified `jobType` when creating your cronConfig, there are different ways the `nest-cron-manager` may execute jobs:

#### 1. `inline`:

Simply pass the `cronConfig` name and a callback function as first and second arguments respectively to the `handleJob` method of the `CronManager` class. The callback function will be executed at the specified cron interval.

```sh
curl -X 'POST' \
  'https://your-server.com/cron-config' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{
  "name": "doSomething",
  "jobType": "inline",
  "enabled": true,
  "context": "{
    \"distributed\": true,
    \"ttl\": 20,
    \"[key]\":\"value\"
  }"
}'
```

The `context` field is optional and can be used to pass additional configuration to the cron job.

In this example, we are passing a `distributed` flag to indicate that the job should be distributed across multiple instances of the application.

We are also passing a `ttl` field to specify the time to live for the job lock in seconds.

Besides the `distributed` and `ttl` fields which are used internally, you can pass any other configuration you want to the cron job which can be accessed in the job handler.

NB: The context field must be a valid JSON string.

You can access a `lens` object which is an instance of the `Lens` class to capture logs and metrics for the job.

```typescript
import { CronManager } from 'nest-cron-manager';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Injectable } from '@nestjs/common';
import { Lens } from 'nest-cron-manager/types';

@Injectable()
export class SomeService {
  constructor(private readonly cronManager: CronManager) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async doSomething() {
    await this.cronManager.handleJob(
      'doSomething',
      async (context: Record<string, any>, lens: Lens) => {
        // Variables here

        // Perform an operation

        // Capture logs and metrics
        lens.capture({
          title: 'Operation 1',
          message: 'Operation 1 successful',
        });

        // Perform another operation

        // Capture logs and metrics
        lens.capture({
          title: 'Operation 2',
          message: 'Operation 2 successful',
          total: 5,
          // Add any other data you want to capture
        });

        // If an error is thrown, the job will be marked as failed
        // throw new Error('your error message');
      },
    );
  }
}
```

#### 2. `query`:

The `nest-cron-manager` will execute a valid sql query if you create a `CronConfig` with the jobType set to `query`, and a valid cronExpression specified. The query will be encrypted at rest and decrypted at runtime using the `querySecret` provided when creating the `CronManager` instance.

```sh
curl -X 'POST' \
  'https://your-server.com/cron-config' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{
  "name": "doSomething",
  "jobType": "query",
  "enabled": false,
  "query": "SELECT * FROM inventory",
}'
```

#### 3. `method`:

The `nest-cron-manager` will execute methods defined on your `CronJobService` class if you create a `CronConfig` with the jobType set to `method`, and a valid cronExpression provided. The `nest-cron-manager` identifies the method to execute by matching the `CronConfig` name with the method name so ensure they match.

```sh
curl -X 'POST' \
  'https://your-server.com/cron-config' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{
  "name": "doSomething",
  "jobType": "method",
  "enabled": false,
  "cronExpression": "0 0 * * *",
}'
```

Below is an example of how you may define your method on a `CronJobService` class:

```typescript
import { Injectable } from '@nestjs/common';
import { bindMethods, Lens } from 'nest-cron-manager';

@Injectable()
export class CronJobService {
  constructor() {}

  onModuleInit() {
    // This is important to ensure that the `this` context is preserved
    bindMethods(this);
  }

  async doSomething(context: JobContext, lens: Lens) {
    try {
      // Perform some operation

      // Capture logs and metrics
      lens.capture({
        title: 'Operation 1',
        message: 'Operation 1 successful',
      });
    } catch (error) {
      // Capture error logs and metrics
      lens.capture({
        title: 'Failed to do something',
        message: error.message,
      });
    }
  }
}
```

Congratulations! You have successfully set up the `nest-cron-manager` library in your NestJS application. With this powerful tool, you can now manage your cron jobs with ease and confidence. The library provides you with the ability to enable or disable individual cron jobs or even all jobs at once, giving you full control over your scheduled tasks. This ensures that your cron jobs run as expected, improving the reliability and maintainability of your application.

By integrating `nest-cron-manager`, you have taken a significant step towards automating and optimizing your application's background processes. Whether you need to schedule regular data backups, send periodic notifications, or perform routine maintenance tasks, this library has you covered.

Thank you for using `nest-cron-manager`. I hope it enhances your development experience and helps you achieve your project goals. Stay tuned for more because they sure are coming!

## License

This project is licensed under the MIT License - See the [LICENSE](LICENSE) file for details.
