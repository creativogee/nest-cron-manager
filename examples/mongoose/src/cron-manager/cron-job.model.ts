import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  CronConfig as CronConfigInterface,
  CronJob as CronJobInterface,
} from 'nest-cron-manager/types';

export type CronJobDocument = HydratedDocument<CronJob>;

@Schema({
  collection: 'cron_jobs',
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class CronJob implements CronJobInterface {
  id: string;

  @Prop({ required: true })
  configId: string;

  @Prop({ type: String })
  result: string;

  @Prop({ required: true, type: Date })
  startedAt: Date;

  @Prop({ type: Date })
  completedAt: Date;

  @Prop({ type: Date })
  failedAt: Date;

  config: CronConfigInterface;
}

export const CronJobSchema = SchemaFactory.createForClass(CronJob);

CronJobSchema.virtual('id').get(function () {
  return this._id.toHexString();
});
