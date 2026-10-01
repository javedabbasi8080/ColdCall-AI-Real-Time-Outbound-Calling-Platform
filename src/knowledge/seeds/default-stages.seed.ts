/**
 * Default conversation stages for sales categories.
 * Admin can edit per category — no code change needed for new businesses.
 */
export type StageSeed = {
  key: string;
  stageName: string;
  goal: string;
  instructions: string;
  allowedQuestions: string[];
  forbiddenQuestions: string[];
  nextPossibleStages: string[];
  priority: number;
  completionRules: string[];
  skipRules: string[];
};

export const DEFAULT_SALES_STAGES: StageSeed[] = [
  {
    key: 'greeting',
    stageName: 'Greeting',
    goal: 'Warm Pakistani greeting and introduce yourself and the business',
    instructions:
      'Complete a natural Assalam o Alaikum greeting with your name and project. Ask if they have two minutes. Then WAIT. Never ask budget or product type here.',
    allowedQuestions: ['Do you have two minutes?'],
    forbiddenQuestions: ['What is your budget?', 'Plot or villa?', 'Investment or family?'],
    nextPossibleStages: ['permission'],
    priority: 10,
    completionRules: ['greeting_spoken'],
    skipRules: [],
  },
  {
    key: 'permission',
    stageName: 'Permission',
    goal: 'Confirm the customer can talk now',
    instructions:
      'If they say jee boliye / haan / theek, thank them briefly and move to rapport. If busy, schedule callback. Never jump to qualification.',
    allowedQuestions: ['Is now a good time?', 'When should I call back?'],
    forbiddenQuestions: ['What is your budget?', 'Plot or villa?'],
    nextPossibleStages: ['rapport', 'closing'],
    priority: 20,
    completionRules: ['customer_gave_permission'],
    skipRules: ['customer_already_engaged'],
  },
  {
    key: 'rapport',
    stageName: 'Rapport Building',
    goal: 'Build trust and state the reason for the call',
    instructions:
      'Thank them. Explain inquiry reason in your own words. Softly learn plot vs villa only if unknown. Never budget yet. Sound human.',
    allowedQuestions: ['Plot or villa?'],
    forbiddenQuestions: ['What is your budget?', 'Cash or instalments?'],
    nextPossibleStages: ['purpose', 'requirement_discovery'],
    priority: 30,
    completionRules: ['inquiry_reason_explained'],
    skipRules: [],
  },
  {
    key: 'purpose',
    stageName: 'Purpose',
    goal: 'Understand why they inquired',
    instructions:
      'Invite them to share interest. Listen. If they volunteer property type or purpose, remember it and skip later questions. Only then move to requirement discovery.',
    allowedQuestions: ['What were you looking for?'],
    forbiddenQuestions: ['What is your budget?'],
    nextPossibleStages: ['requirement_discovery'],
    priority: 40,
    completionRules: ['customer_shared_interest_or_invited'],
    skipRules: ['property_type_already_known'],
  },
  {
    key: 'requirement_discovery',
    stageName: 'Requirement Discovery',
    goal: 'Discover plot vs villa (or other product) naturally',
    instructions:
      'Ask plot or villa only if unknown. One short question. Acknowledge emotionally. Never stack questions.',
    allowedQuestions: ['Are you looking at a plot or a villa?'],
    forbiddenQuestions: ['What is your budget?'],
    nextPossibleStages: ['qualification'],
    priority: 50,
    completionRules: ['property_type_known'],
    skipRules: ['property_type_already_known'],
  },
  {
    key: 'qualification',
    stageName: 'Qualification',
    goal: 'Learn family vs investment purpose',
    instructions:
      'Ask family/residence vs investment only if unknown. Acknowledge. One question only.',
    allowedQuestions: ['Is this for family or investment?'],
    forbiddenQuestions: ['What is your budget?'],
    nextPossibleStages: ['product_recommendation', 'budget_discussion'],
    priority: 60,
    completionRules: ['purpose_known'],
    skipRules: ['purpose_already_known'],
  },
  {
    key: 'product_recommendation',
    stageName: 'Product Recommendation',
    goal: 'Suggest suitable options from knowledge/products',
    instructions:
      'Paraphrase available products/sizes from knowledge. Never recite database fields word-for-word. Soft consultative tone.',
    allowedQuestions: [],
    forbiddenQuestions: [],
    nextPossibleStages: ['budget_discussion', 'appointment'],
    priority: 70,
    completionRules: ['options_shared'],
    skipRules: [],
  },
  {
    key: 'budget_discussion',
    stageName: 'Budget Discussion',
    goal: 'Gently learn budget range if unknown',
    instructions:
      'ONLY ask budget if not already known AND after property type + purpose. Soft phrasing: agar share karna chahein...',
    allowedQuestions: ['What budget range are you looking at?'],
    forbiddenQuestions: [],
    nextPossibleStages: ['payment_discussion', 'appointment'],
    priority: 80,
    completionRules: ['budget_known_or_declined'],
    skipRules: ['budget_already_known'],
  },
  {
    key: 'payment_discussion',
    stageName: 'Payment Discussion',
    goal: 'Cash vs instalments if relevant',
    instructions: 'Ask cash or instalments only if unknown and useful. Keep short.',
    allowedQuestions: ['Cash or instalments?'],
    forbiddenQuestions: [],
    nextPossibleStages: ['appointment', 'objection_handling'],
    priority: 90,
    completionRules: ['payment_known_or_skipped'],
    skipRules: ['payment_already_known'],
  },
  {
    key: 'objection_handling',
    stageName: 'Objection Handling',
    goal: 'Handle concerns using objection strategies',
    instructions:
      'Listen. Empathize with Pakistani phrases. Use objection handling strategies from knowledge. Then guide back to appointment.',
    allowedQuestions: [],
    forbiddenQuestions: [],
    nextPossibleStages: ['appointment', 'closing', 'follow_up'],
    priority: 100,
    completionRules: ['objection_addressed'],
    skipRules: [],
  },
  {
    key: 'appointment',
    stageName: 'Appointment',
    goal: 'Book site visit or consultant call',
    instructions:
      'Offer site visit or property consultant call. Ask subah or sham. Confirm WhatsApp details.',
    allowedQuestions: ['Morning or afternoon for the visit?'],
    forbiddenQuestions: [],
    nextPossibleStages: ['closing', 'follow_up'],
    priority: 110,
    completionRules: ['appointment_booked_or_declined'],
    skipRules: [],
  },
  {
    key: 'closing',
    stageName: 'Closing',
    goal: 'Polite professional close',
    instructions:
      'Warm close: thank them, say details will be saved, team will follow up, Allah hafiz. No new sales questions.',
    allowedQuestions: [],
    forbiddenQuestions: ['What is your budget?'],
    nextPossibleStages: [],
    priority: 120,
    completionRules: ['call_ended'],
    skipRules: [],
  },
  {
    key: 'follow_up',
    stageName: 'Follow-up',
    goal: 'Schedule a later callback automatically in the conversation',
    instructions: 'Agree a callback time politely (aaj sham / kal). Confirm. Then warm close.',
    allowedQuestions: ['When should I call back?'],
    forbiddenQuestions: [],
    nextPossibleStages: ['closing'],
    priority: 130,
    completionRules: ['callback_scheduled'],
    skipRules: [],
  },
];
