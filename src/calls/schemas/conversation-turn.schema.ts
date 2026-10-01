import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum ConversationRole {
  SYSTEM = 'system',
  LEAD = 'lead',
}

export type ConversationTurnDocument = HydratedDocument<ConversationTurn>;

@Schema({ timestamps: { createdAt: false, updatedAt: false } })
export class ConversationTurn {
  @Prop({ type: Types.ObjectId, ref: 'CallSession', required: true, index: true })
  callSessionId: Types.ObjectId;

  @Prop({ enum: ConversationRole, required: true })
  role: ConversationRole;

  @Prop({ required: true })
  message: string;

  @Prop({ default: '' })
  audioUrl: string;

  @Prop({ default: () => new Date() })
  timestamp: Date;

  @Prop({ default: '' })
  detectedIntent: string;

  @Prop()
  scriptStep?: number;

  @Prop({ default: '' })
  rawTranscript: string;

  @Prop({ default: 0 })
  charactersSynthesized: number;
}

export const ConversationTurnSchema = SchemaFactory.createForClass(ConversationTurn);
