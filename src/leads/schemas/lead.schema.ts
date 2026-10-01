import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum LeadStatus {
  PENDING = 'pending',
  CALLED = 'called',
  INTERESTED = 'interested',
  NOT_INTERESTED = 'not_interested',
  CALLBACK = 'callback',
  VOICEMAIL = 'voicemail',
  FAILED = 'failed',
  DO_NOT_CALL = 'do_not_call',
}

export type LeadDocument = HydratedDocument<Lead>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Lead {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, index: true })
  phone: string;

  @Prop({ default: '' })
  email: string;

  @Prop({ default: '' })
  company: string;

  @Prop({ type: Types.ObjectId, ref: 'Category', required: true })
  category: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CsvBatch' })
  csvBatch?: Types.ObjectId;

  @Prop({ enum: LeadStatus, default: LeadStatus.PENDING })
  status: LeadStatus;

  @Prop({ default: 0 })
  callAttempts: number;

  @Prop()
  lastCalledAt?: Date;

  @Prop()
  callbackScheduledAt?: Date;

  @Prop({ default: '' })
  notes: string;

  @Prop({ default: 'America/New_York' })
  timezone: string;

  @Prop()
  deletedAt?: Date;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);
LeadSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
