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

  @Column({ default: false })
  reset: boolean;

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
