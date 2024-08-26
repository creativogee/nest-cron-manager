import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, HydratedDocument } from 'mongoose';
import { CronManagerControl as CronManagerControlInterface } from 'nest-cron-manager';

export type CronManagerControlDocument = HydratedDocument<CronManagerControl>;

@Schema({
  collection: 'cron_manager_control',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class CronManagerControl
  extends Document
  implements CronManagerControlInterface
{
  id: string;

  @Prop({ default: false })
  reset: boolean;

  @Prop({ default: [] })
  replicaIds: string[];

  @Prop({ default: [] })
  staleReplicas: string[];

  @Prop({ default: '' })
  cmcv: string;
}

export const CronManagerControlSchema =
  SchemaFactory.createForClass(CronManagerControl);

CronManagerControlSchema.virtual('id').get(function () {
  return this._id;
});
