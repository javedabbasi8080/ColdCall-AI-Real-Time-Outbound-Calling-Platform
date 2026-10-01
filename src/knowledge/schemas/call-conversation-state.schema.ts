import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CallConversationStateDocument = HydratedDocument<CallConversationState>;

@Schema({ _id: false })
export class StructuredMemory {
  @Prop({ default: '' })
  customerName: string;

  @Prop({ default: '' })
  customerPurpose: string;

  @Prop({ default: '' })
  propertyType: string;

  @Prop({ default: '' })
  budget: string;

  @Prop({ default: '' })
  locationPreference: string;

  @Prop({ default: '' })
  timeline: string;

  @Prop({ default: '' })
  investmentPurpose: string;

  @Prop({ default: '' })
  paymentPreference: string;

  @Prop({ default: '' })
  familySize: string;

  @Prop({ default: '' })
  preferredSize: string;

  @Prop({ default: '' })
  notes: string;

  @Prop({ default: '' })
  appointmentStatus: string;

  @Prop({ default: '' })
  conversationSummary: string;

  @Prop({ type: [String], default: [] })
  knownFacts: string[];
}

export const StructuredMemorySchema = SchemaFactory.createForClass(StructuredMemory);

@Schema({ timestamps: true, collection: 'call_conversation_states' })
export class CallConversationState {
  @Prop({ type: Types.ObjectId, ref: 'CallSession', index: true })
  callSessionId?: Types.ObjectId;

  @Prop({ required: true, index: true, unique: true })
  callSid: string;

  @Prop({ type: Types.ObjectId, ref: 'Category', required: true, index: true })
  categoryId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Lead' })
  leadId?: Types.ObjectId;

  @Prop({ default: 'greeting' })
  currentStageKey: string;

  @Prop({ type: [String], default: [] })
  completedStages: string[];

  @Prop({ type: StructuredMemorySchema, default: () => ({}) })
  memory: StructuredMemory;

  @Prop({ default: '' })
  lastCustomerIntent: string;

  @Prop({ default: '' })
  lastAgentIntent: string;

  /** True after we answered a customer question — wait for more Qs before sales push. */
  @Prop({ default: false })
  inCustomerQa: boolean;

  /** Soft permission already offered to start qualification. */
  @Prop({ default: false })
  offeredContinuePermission: boolean;

  @Prop({ type: [{ role: String, content: String, at: Date }], default: [] })
  recentMessages: Array<{ role: string; content: string; at: Date }>;
}

export const CallConversationStateSchema =
  SchemaFactory.createForClass(CallConversationState);
