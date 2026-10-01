import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum CallSessionStatus {
  INITIATED = 'initiated',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  NO_ANSWER = 'no_answer',
}

export enum CallOutcome {
  INTERESTED = 'interested',
  NOT_INTERESTED = 'not_interested',
  CALLBACK = 'callback',
  VOICEMAIL = 'voicemail',
  HUNG_UP = 'hung_up',
  NO_ANSWER = 'no_answer',
}

export enum CallDirection {
  OUTBOUND = 'outbound',
  INBOUND = 'inbound',
}

export type CallSessionDocument = HydratedDocument<CallSession>;

@Schema({ timestamps: false })
export class CallSession {
  @Prop({ type: Types.ObjectId, ref: 'Lead', required: true })
  leadId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Category', required: true })
  categoryId: Types.ObjectId;

  @Prop({ index: true })
  twilioCallSid?: string;

  @Prop({ enum: CallDirection, default: CallDirection.OUTBOUND })
  direction: CallDirection;

  @Prop({ enum: CallSessionStatus, default: CallSessionStatus.INITIATED })
  status: CallSessionStatus;

  @Prop({ default: 0 })
  currentStep: number;

  @Prop({ default: () => new Date() })
  startedAt: Date;

  @Prop()
  endedAt?: Date;

  @Prop({ default: 0 })
  durationSeconds: number;

  @Prop({ enum: CallOutcome })
  outcome?: CallOutcome;

  @Prop()
  callbackScheduledAt?: Date;

  @Prop({ default: '' })
  agentNotes: string;

  @Prop({ type: [String], default: [] })
  elevenLabsAudioUrls: string[];

  @Prop({ default: 0 })
  openaiPromptTokens: number;

  @Prop({ default: 0 })
  openaiCompletionTokens: number;

  @Prop({ default: 0 })
  elevenLabsCharacters: number;
}

export const CallSessionSchema = SchemaFactory.createForClass(CallSession);
