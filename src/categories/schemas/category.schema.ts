import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  BusinessKnowledge,
  BusinessKnowledgeSchema,
} from '../../knowledge/schemas/business-knowledge.schema';

export type CategoryDocument = HydratedDocument<Category>;

/** @deprecated Kept for admin compat during migration — empty preferred. */
@Schema({ _id: false })
export class ScriptStep {
  @Prop({ required: true })
  step: number;

  @Prop({ required: true })
  message: string;

  @Prop({ type: [String], default: [] })
  expectedResponses: string[];

  @Prop({ default: '' })
  objectionRebuttal: string;
}

export const ScriptStepSchema = SchemaFactory.createForClass(ScriptStep);

/** @deprecated Migrated into BusinessKnowledge + related collections. */
@Schema({ _id: false })
export class FaqItem {
  @Prop({ default: '' })
  question: string;

  @Prop({ default: '' })
  answer: string;
}

export const FaqItemSchema = SchemaFactory.createForClass(FaqItem);

/** @deprecated Use Category.knowledge + products/faqs/stages collections. */
@Schema({ _id: false })
export class CategoryPlaybook {
  @Prop({ default: '' })
  businessName: string;

  @Prop({ default: '' })
  projectName: string;

  @Prop({ default: '' })
  industry: string;

  @Prop({ default: '' })
  agentName: string;

  @Prop({ default: 'female', enum: ['female', 'male'] })
  agentGender: string;

  @Prop({ default: 'Sales Consultant' })
  agentRole: string;

  @Prop({ default: '' })
  greetingStyle: string;

  @Prop({ default: 'urdu', enum: ['urdu', 'english'] })
  language: string;

  @Prop({ default: '' })
  city: string;

  @Prop({ default: '' })
  country: string;

  @Prop({ default: '' })
  location: string;

  @Prop({ type: [String], default: [] })
  products: string[];

  @Prop({ type: [String], default: [] })
  inventory: string[];

  @Prop({ type: [String], default: [] })
  sizes: string[];

  @Prop({ type: [String], default: [] })
  priceRanges: string[];

  @Prop({ type: [String], default: [] })
  paymentPlans: string[];

  @Prop({ default: '' })
  businessInfo: string;

  @Prop({ type: [String], default: [] })
  qualificationTopics: string[];

  @Prop({ type: [String], default: [] })
  salesGoals: string[];

  @Prop({ type: [String], default: [] })
  objectionHandling: string[];

  @Prop({ default: '' })
  closingStrategy: string;

  @Prop({ default: '' })
  appointmentRules: string;

  @Prop({ type: [FaqItemSchema], default: [] })
  faqs: FaqItem[];

  @Prop({ default: '' })
  companyDetails: string;

  @Prop({ type: [String], default: [] })
  neverMention: string[];
}

export const CategoryPlaybookSchema = SchemaFactory.createForClass(CategoryPlaybook);

@Schema({ _id: false })
export class VoiceSettings {
  @Prop()
  elevenLabsVoiceId?: string;

  @Prop({ default: 0.45, min: 0, max: 1 })
  stability: number;

  @Prop({ default: 0.75, min: 0, max: 1 })
  similarityBoost: number;
}

export const VoiceSettingsSchema = SchemaFactory.createForClass(VoiceSettings);

@Schema({ timestamps: { createdAt: true, updatedAt: true } })
export class Category {
  @Prop({ required: true, unique: true, trim: true })
  name: string;

  /** Primary business knowledge base (admin-editable). */
  @Prop({ type: BusinessKnowledgeSchema, default: () => ({}) })
  knowledge: BusinessKnowledge;

  /** @deprecated Migrated into knowledge — kept for safe rollback. */
  @Prop({ type: CategoryPlaybookSchema, default: () => ({}) })
  playbook: CategoryPlaybook;

  /** @deprecated Empty — scripts removed from conversation engine. */
  @Prop({ type: [ScriptStepSchema], default: [] })
  script: ScriptStep[];

  @Prop({ type: VoiceSettingsSchema, default: () => ({}) })
  voiceSettings: VoiceSettings;

  @Prop({ default: '' })
  knowledgeRevision: string;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
