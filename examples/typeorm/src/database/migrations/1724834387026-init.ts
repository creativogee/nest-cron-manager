import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1724834387026 implements MigrationInterface {
    name = 'Init1724834387026'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "posts" ("id" SERIAL NOT NULL, "title" character varying NOT NULL, "content" text NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "userId" integer, CONSTRAINT "PK_2829ac61eff60fcec60d7274b9e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" SERIAL NOT NULL, "username" character varying NOT NULL, "email" character varying NOT NULL, "password" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'active', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username"), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "cron_configs" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "jobType" character varying DEFAULT 'inline', "enabled" boolean NOT NULL DEFAULT false, "context" jsonb, "cronExpression" character varying, "query" character varying, "silent" boolean DEFAULT false, "deletedAt" TIMESTAMP, CONSTRAINT "UQ_1e8ef085aef9fe3ede57d4933f6" UNIQUE ("name"), CONSTRAINT "PK_30e15e439bfe7d4309957302389" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "cron_jobs" ("id" SERIAL NOT NULL, "result" jsonb, "startedAt" TIMESTAMP NOT NULL, "completedAt" TIMESTAMP, "failedAt" TIMESTAMP, "configId" integer, CONSTRAINT "PK_189a8029b8fff4f0e2040f652ee" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c53d986279f403388300db3c25" ON "cron_jobs" ("configId") `);
        await queryRunner.query(`CREATE TABLE "cron_manager_control" ("id" SERIAL NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "reset" boolean NOT NULL DEFAULT false, "replicaIds" jsonb NOT NULL DEFAULT '[]', "staleReplicas" jsonb NOT NULL DEFAULT '[]', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "cmcv" character varying NOT NULL, CONSTRAINT "PK_9907973df9437e9a3c71fab2e8a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "posts" ADD CONSTRAINT "FK_ae05faaa55c866130abef6e1fee" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cron_jobs" ADD CONSTRAINT "FK_c53d986279f403388300db3c25e" FOREIGN KEY ("configId") REFERENCES "cron_configs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "cron_jobs" DROP CONSTRAINT "FK_c53d986279f403388300db3c25e"`);
        await queryRunner.query(`ALTER TABLE "posts" DROP CONSTRAINT "FK_ae05faaa55c866130abef6e1fee"`);
        await queryRunner.query(`DROP TABLE "cron_manager_control"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c53d986279f403388300db3c25"`);
        await queryRunner.query(`DROP TABLE "cron_jobs"`);
        await queryRunner.query(`DROP TABLE "cron_configs"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "posts"`);
    }

}
