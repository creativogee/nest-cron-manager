# nest-cron-manager

## Overview

This project, `nest-cron-manager`, is a TypeScript-based library designed to manage and execute cron jobs efficiently within a NestJS application. It provides a robust interface for scheduling, executing, and logging cron jobs, with support for Redis-based locking mechanisms to ensure job execution integrity. The library leverages ORM frameworks like TypeORM or Mongoose for database operations and is designed to be extensible, allowing for easy integration with other ORMs in the future. It integrates seamlessly with NestJS's dependency injection system.

## Installation

To install the package, use npm:

```sh
npm install nest-cron-manager
```

## Usage

### Prerequisites

Please see the [repository](https://github.com/creativogee/nest-cron-manager/tree/main/examples) for examples of how to use the library.

Before using the `nest-cron-manager` library, ensure the following requirements are met:

- Install `ioredis`, `@nestjs/config`, `@nestjs/schedule`
- Install `typeorm`, `@nestjs/typeorm`, `pg` or `@nestjs/mongoose`, `mongoose` depending on the ORM you are using.

  ```sh
  npm install ioredis typeorm @nestjs/config @nestjs/schedule @nestjs/typeorm pg
  ```

- Create `CronConfig` and `CronJob` models in your project which implement the `CronConfigInterface` and `CronJobInterface` respectively.

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
    jobType?: string;

    @Column({ default: false })
    enabled: boolean;

    @Column({ nullable: true, type: 'jsonb' })
    context?: any;

    @Column({ nullable: true })
    cronExpression?: string;

    @Column({ nullable: true })
    query?: string;

    @Column({ nullable: true, default: false })
    dryRun?: boolean;

    @Column({ nullable: true })
    deletedAt?: Date;

    @OneToMany(() => CronJob, (cronJob) => cronJob.config)
    jobs: CronJob[];
  }
  ```

  ```typescript
  // src/cron-manager/cron-job.model.ts

  import { Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
  import { CronConfig } from './cron-config.model';
  import { CronJob as CronJobInterface } from 'nest-cron-manager/types';

  @Entity({ name: 'cron_jobs' })
  export class CronJob implements CronJobInterface {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @ManyToOne(() => CronConfig, (config) => config.jobs)
    config: CronConfig;

    @Column({ nullable: true, type: 'jsonb' })
    result?: any;

    @Column()
    startedAt: Date;

    @Column({ nullable: true })
    completedAt: Date;

    @Column({ nullable: true })
    failedAt: Date;
  }
  ```

- NB: You can implement whatever network and serialization protocol you want to use. For the purpose of this example, we will use gRPC.
- Create these protobuf service definitions: `CreateCronConfig` and `UpdateCronConfig` in your project. For this example, we will use the inventory service.

  ```protobuf
  syntax = "proto3";

  package cron;

  service InventoryService {
    /**
    * Create new inventory cron config. Cron config name must match the function name
    */
    rpc CreateCronConfig(cron.CreateCronConfigRequest) returns (cron.CreateCronConfigResponse) {
        option (google.api.http) = {
            post: "/v1/inventory/cron-config"
            body: "*"
        };
    };

    /**
    * Update inventory cron config. Cron config name must match the function name
    */
    rpc UpdateCronConfig(cron.UpdateCronConfigRequest) returns (cron.UpdateCronConfigResponse) {
        option (google.api.http) = {
            put: "/v1/inventory/cron-config/{id}"
            body: "*"
        };
    };

    // Add other service methods as needed. See the `CronManager` class for available methods.
  }

  ```

- Create a `CronConfigController` in your project to handle the creation and updating of cron configurations.

  ```typescript
  // src/cron-manager/cron-config.controller.ts

  import { CronManager } from 'nest-cron-manager';
  import { Controller } from '@nestjs/common';
  import { GrpcMethod } from '@nestjs/microservices';
  import {
    CreateCronConfigRequest,
    UpdateCronConfigRequest,
  } from '../../generated_ts_proto/inventory/inventory_pb';

  @Controller()
  export class CronConfigController {
    constructor(private readonly cronManager: CronManager) {}

    @GrpcMethod('InventoryService', 'CreateCronConfig')
    async createCronConfig(data: CreateCronConfigRequest.AsObject) {
      return this.cronManager.createCronConfig(data);
    }

    @GrpcMethod('InventoryService', 'UpdateCronConfig')
    async updateCronConfig(data: UpdateCronConfigRequest.AsObject) {
      return this.cronManager.updateCronConfig(data);
    }

    // Add other controller methods as needed. See the `CronManager` class for available methods.
  }
  ```

- Create a `CacheService` in your project and ensure it implements a `getClient` method.

  ```typescript
  import { Injectable } from '@nestjs/common';

  @Injectable()
  export class CacheService {
    getClient(): Redis {
      return this.client;
    }
  }
  ```

- Implement nestjs config service in your project.

  ```typescript
  import { registerAs } from '@nestjs/config';

  export default registerAs('config', () => ({
    cronManager: {
      enabled: process.env.CRON_MANAGER_ENABLED,
      querySecret: process.env.CRON_MANAGER_QUERY_SECRET,
    },
  }));
  ```

### Instantiating the CronManager class

Create an instance of CronManager by passing the required dependencies specified in `CronManagerDeps`:

```typescript
// src/cron-manager/cron-manager.module.ts

import { CacheModule } from '@/cache/cache.module';
import { CacheService } from '@/cache/cache.service';
import { PostModule } from '@/post/post.module';
import { UserModule } from '@/user/user.module';
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getEntityManagerToken, getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { CronManager } from 'nest-cron-manager';
import { EntityManager, Repository } from 'typeorm';
import { CronConfigController } from './cron-config.controller';
import { CronConfig } from './cron-config.model';
import { CronJob } from './cron-job.model';
import { CronJobService } from './cron-job.service';
import { ProductModule } from './product/product.module';

@Module({
  controllers: [CronConfigController],
  imports: [
    CacheModule,
    TypeOrmModule.forFeature([CronConfig, CronJob]),
    // Be mindful of circular dependencies for modules which import the CronMangerModule
    forwardRef(() => ProductModule),
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
      ) =>
        new CronManager({
          logger: new Logger(CronManager.name),
          configService,
          cronConfigRepository,
          cronJobRepository,
          redisService,
          cronJobService,
          entityManager,
          ormType: 'typeorm',
        }),
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
export class CronMangerModule {}
```

### CronManager Dependencies

| Dependency           | Description                                                           | required |
| -------------------- | --------------------------------------------------------------------- | -------- |
| logger               | A logger instance                                                     | true     |
| configService        | Your app's config service instance                                    | true     |
| cronConfigRepository | The repository for the `CronConfig` model                             | true     |
| cronJobRepository    | The repository for the `CronJob` model                                | true     |
| redisService         | A cache service instance                                              | true     |
| ormType              | The ORM type to use (currently only supports `typeorm` or `mongoose`) | true     |
| entityManager        | The entity manager for `typeorm` only                                 | true     |

### Executing cron jobs

Depending on the specified jobType when creating your cronConfig, there are different ways the cronManager may execute the job:

### 1. `inline`:

The cron job will execute a inline function passed to the `handleJob` method of the `CronManager` class.

```sh
curl -X 'POST' \
  'http://localhost:3000/v1/inventory/cron-config' \
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

Asides from the `distributed` and `ttl` fields which are used internally, you can pass any other configuration you want to the cron job which can be accessed in the job handler function.

NB: The context field must be a valid JSON string.

To execute cron jobs, use the `handleJob` method of the `CronManager` class:

You can access the `lens` object which is an instance of the `Lens` class to capture logs and metrics for the job.

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
      async (context: Record<string, any>, config: Record<string, any>, lens: Lens) => {
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

NB: The method name must match the cronConfig name.

### 2. `query`:

The cron job will execute a query provided during the creation of the cronConfig. The query must be a valid SQL query.
Your query will be encrypted at rest with the query secret provided in your app config and will only be decrypted at runtime using the same secret.

```sh
curl -X 'POST' \
  'http://localhost:3000/v1/inventory/cron-config' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{
  "name": "doSomething",
  "jobType": "query",
  "enabled": false,
  "query": "SELECT * FROM users",
}'
```

### 3. `method`:

The cron job will execute a method defined on your `CronJobService` class. The method name MUST match the cronConfig name and you must provide the cronExpression.

```sh
curl -X 'POST' \
  'http://localhost:3000/v1/inventory/cron-config' \
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
// omitted for brevity

@Injectable()
export class CronJobService {
  constructor() {}

  async doSomething() {
    // Perform some operation
  }
}

// omitted for brevity
```
