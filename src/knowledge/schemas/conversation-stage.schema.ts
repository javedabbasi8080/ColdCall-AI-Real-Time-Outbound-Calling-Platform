import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ConversationStageDocument = HydratedDocument<ConversationStage>;

@Schema({ timestamps: true, collection: 'conversation_stages' })
export class ConversationStage {
  @Prop({ type: Types.ObjectId, ref: 'Category', required: true, index: true })
  categoryId: Types.ObjectId;

  /** Machine key e.g. greeting, permission, rapport */
  @Prop({ required: true, trim: true })
  key: string;

  @Prop({ required: true })
  stageName: string;

  @Prop({ default: '' })
  goal: string;

  @Prop({ default: '' })
  instructions: string;

  @Prop({ type: [String], default: [] })
  allowedQuestions: string[];

  @Prop({ type: [String], default: [] })
  forbiddenQuestions: string[];

  @Prop({ type: [String], default: [] })
  nextPossibleStages: string[];

  @Prop({ default: 0 })
  priority: number;

  @Prop({ type: [String], default: [] })
  completionRules: string[];

  @Prop({ type: [String], default: [] })
  skipRules: string[];

  @Prop({ default: true })
  active: boolean;
}

export const ConversationStageSchema = SchemaFactory.createForClass(ConversationStage);
ConversationStageSchema.index({ categoryId: 1, key: 1 }, { unique: true });
ConversationStageSchema.index({ categoryId: 1, priority: 1 });
