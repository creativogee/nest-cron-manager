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
  dryRun: boolean;

  @Column({ nullable: true })
  deletedAt: Date;

  @OneToMany(() => CronJob, (cronJob) => cronJob.config)
  jobs: CronJobInterface[];
}
