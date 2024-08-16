import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1723765109077 implements MigrationInterface {
    name = 'Init1723765109077'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "cron_configs" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "jobType" character varying DEFAULT 'inline', "enabled" boolean NOT NULL DEFAULT false, "context" jsonb, "cronExpression" character varying, "query" character varying, "dryRun" boolean DEFAULT false, "deletedAt" TIMESTAMP, CONSTRAINT "UQ_1e8ef085aef9fe3ede57d4933f6" UNIQUE ("name"), CONSTRAINT "PK_30e15e439bfe7d4309957302389" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "cron_jobs" ("id" SERIAL NOT NULL, "result" jsonb, "startedAt" TIMESTAMP NOT NULL, "completedAt" TIMESTAMP, "failedAt" TIMESTAMP, "configId" integer, CONSTRAINT "PK_189a8029b8fff4f0e2040f652ee" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c53d986279f403388300db3c25" ON "cron_jobs" ("configId") `);
        await queryRunner.query(`ALTER TABLE "cron_jobs" ADD CONSTRAINT "FK_c53d986279f403388300db3c25e" FOREIGN KEY ("configId") REFERENCES "cron_configs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "cron_jobs" DROP CONSTRAINT "FK_c53d986279f403388300db3c25e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c53d986279f403388300db3c25"`);
        await queryRunner.query(`DROP TABLE "cron_jobs"`);
        await queryRunner.query(`DROP TABLE "cron_configs"`);
    }

}
