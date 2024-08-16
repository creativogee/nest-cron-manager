import {
  CronConfig as CronConfigInterface,
  CronJob as CronJobInterface,
} from 'nest-cron-manager/types';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
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
