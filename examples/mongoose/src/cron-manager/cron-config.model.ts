import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, HydratedDocument } from 'mongoose';
import { CronManager } from 'nest-cron-manager';
import {
  CronConfig as CronConfigInterface,
  CronJob as CronJobInterface,
} from 'nest-cron-manager/types';
import { CronJob } from './cron-job.model';

export type CronConfigDocument = HydratedDocument<CronConfig>;

@Schema({
  collection: 'cron_configs',
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      delete ret._id;
      delete ret.deletedAt;
      delete ret.__v;
    },
  },
  toObject: {
    virtuals: true,
    transform: (doc, ret) => {
      delete ret._id;
      delete ret.deletedAt;
      delete ret.__v;

      return ret;
    },
  },
})
export class CronConfig extends Document implements CronConfigInterface {
  id: string;

  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ default: CronManager.JobType.INLINE })
  jobType: string;

  @Prop({ default: false })
  enabled: boolean;

  @Prop({ type: mongoose.Schema.Types.Mixed })
  context: any; // json

  @Prop({ type: String })
  cronExpression: string;

  @Prop({ type: String })
  query: string;

  @Prop({ default: false })
  silent: boolean;

  @Prop({ type: Date, default: null })
  deletedAt: Date;

  jobs: CronJobInterface[];
}

export const CronConfigSchema = SchemaFactory.createForClass(CronConfig);

CronConfigSchema.virtual('id').get(function () {
  return this._id;
});

CronConfigSchema.virtual('jobs', {
  ref: CronJob.name,
  localField: '_id',
  foreignField: 'configId',
  justOne: false,
});

CronConfigSchema.pre('find', function () {
  this.where({ deletedAt: null });
});

CronConfigSchema.pre('findOne', function () {
  this.where({ deletedAt: null });
});

CronConfigSchema.pre('countDocuments', function () {
  this.where({ deletedAt: null });
});

CronConfigSchema.pre('findOneAndUpdate', function () {
  this.where({ deletedAt: null });
});
