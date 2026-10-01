import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/**
 * Structured business knowledge — NEVER read aloud as a script.
 * Used by the dynamic prompt builder + stage engine only.
 */
@Schema({ _id: false })
export class BusinessKnowledge {
  @Prop({ default: '' })
  businessName: string;

  @Prop({ default: '' })
  businessDescription: string;

  @Prop({ default: '' })
  industry: string;

  @Prop({ default: '' })
  country: string;

  @Prop({ default: '' })
  city: string;

  @Prop({ default: '' })
  projectName: string;

  @Prop({ default: '' })
  companyIntroduction: string;

  @Prop({ default: 'Property Consultant' })
  agentRole: string;

  @Prop({ default: '' })
  agentName: string;

  @Prop({ default: 'female', enum: ['female', 'male'] })
  agentGender: string;

  @Prop({ default: '' })
  greetingStyle: string;

  @Prop({ default: '' })
  businessTone: string;

  @Prop({ default: '' })
  targetAudience: string;

  @Prop({ type: [String], default: ['urdu'] })
  supportedLanguages: string[];

  @Prop({ default: 'urdu' })
  primaryLanguage: string;

  @Prop({ default: '' })
  conversationGoal: string;

  @Prop({ default: '' })
  qualificationStrategy: string;

  @Prop({ default: '' })
  appointmentStrategy: string;

  @Prop({ default: '' })
  salesStrategy: string;

  @Prop({ default: '' })
  closingStrategy: string;

  @Prop({ default: '' })
  followUpStrategy: string;

  @Prop({ type: [String], default: [] })
  propertyTypes: string[];

  @Prop({ type: [String], default: [] })
  availableSizes: string[];

  @Prop({ type: [String], default: [] })
  priceRanges: string[];

  @Prop({ type: [String], default: [] })
  paymentPlans: string[];

  @Prop({ type: [String], default: [] })
  features: string[];

  @Prop({ type: [String], default: [] })
  amenities: string[];

  @Prop({ type: [String], default: [] })
  locations: string[];

  @Prop({ type: [String], default: [] })
  nearbyLandmarks: string[];

  @Prop({ type: [String], default: [] })
  benefits: string[];

  @Prop({ type: [String], default: [] })
  investmentBenefits: string[];

  @Prop({ type: [String], default: [] })
  requiredCustomerInfo: string[];

  @Prop({ type: [String], default: [] })
  leadQualificationRules: string[];

  @Prop({ type: [String], default: [] })
  conversationRules: string[];

  @Prop({ type: [String], default: [] })
  salesRules: string[];

  @Prop({ type: [String], default: [] })
  escalationRules: string[];

  @Prop({ type: [String], default: [] })
  doNotSayRules: string[];

  @Prop({ type: [String], default: [] })
  greetingTemplates: string[];

  @Prop({ type: [String], default: [] })
  exampleConversations: string[];

  @Prop({ default: '' })
  voicePersonality: string;

  @Prop({ default: '1-3 sentences' })
  responseLength: string;

  @Prop({ type: [String], default: [] })
  memoryRules: string[];

  @Prop({ type: [String], default: [] })
  businessPolicies: string[];

  @Prop({ type: [String], default: [] })
  callObjectives: string[];

  @Prop({ type: [String], default: [] })
  successConditions: string[];

  @Prop({ type: [String], default: [] })
  failureConditions: string[];

  @Prop({ type: [String], default: [] })
  nextStepRules: string[];

  @Prop({ default: '' })
  notes: string;

  @Prop({ default: '' })
  locationLabel: string;
}

export const BusinessKnowledgeSchema = SchemaFactory.createForClass(BusinessKnowledge);
