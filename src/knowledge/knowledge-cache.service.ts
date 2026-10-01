import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { BusinessKnowledge } from './schemas/business-knowledge.schema';
import {
  CallConversationState,
  CallConversationStateDocument,
  StructuredMemory,
} from './schemas/call-conversation-state.schema';
import { CategoryFaq, CategoryFaqDocument } from './schemas/category-faq.schema';
import {
  CategoryObjection,
  CategoryObjectionDocument,
} from './schemas/category-objection.schema';
import {
  CategoryProduct,
  CategoryProductDocument,
} from './schemas/category-product.schema';
import {
  ConversationStage,
  ConversationStageDocument,
} from './schemas/conversation-stage.schema';
import { CATEGORY_KB_SEEDS, KB_REVISION, SARAH_VOICE_ID } from './seeds/category-kb.seed';
import { DEFAULT_SALES_STAGES } from './seeds/default-stages.seed';

export type CachedCategoryKnowledge = {
  categoryId: string;
  categoryName: string;
  knowledge: BusinessKnowledge;
  products: CategoryProduct[];
  faqs: CategoryFaq[];
  objections: CategoryObjection[];
  stages: ConversationStage[];
  stagesByKey: Map<string, ConversationStage>;
  voiceSettings: Category['voiceSettings'];
  loadedAt: number;
};

@Injectable()
export class KnowledgeCacheService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeCacheService.name);
  private readonly cache = new Map<string, CachedCategoryKnowledge>();

  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(CategoryProduct.name)
    private readonly productModel: Model<CategoryProductDocument>,
    @InjectModel(CategoryFaq.name)
    private readonly faqModel: Model<CategoryFaqDocument>,
    @InjectModel(CategoryObjection.name)
    private readonly objectionModel: Model<CategoryObjectionDocument>,
    @InjectModel(ConversationStage.name)
    private readonly stageModel: Model<ConversationStageDocument>,
    @InjectModel(CallConversationState.name)
    private readonly stateModel: Model<CallConversationStateDocument>,
  ) {}

  async onModuleInit() {
    await this.migrateAndSeedAll();
    await this.warmAll();
  }

  async migrateAndSeedAll() {
    for (const seed of CATEGORY_KB_SEEDS) {
      const cat = await this.categoryModel.findOne({ name: seed.categoryName }).exec();
      if (!cat) {
        this.logger.warn(`Category "${seed.categoryName}" missing — skip KB seed`);
        continue;
      }
      const id = cat._id.toString();

      if (cat.knowledgeRevision === KB_REVISION && cat.knowledge?.businessName) {
        this.logger.log(`KB "${seed.categoryName}" already on ${KB_REVISION}`);
        continue;
      }

      // Migrate legacy playbook → knowledge if empty
      if (!cat.knowledge?.businessName && cat.playbook?.businessName) {
        cat.knowledge = this.playbookToKnowledge(cat.playbook) as BusinessKnowledge;
      }

      cat.knowledge = {
        ...(cat.knowledge as object),
        ...seed.knowledge,
      } as BusinessKnowledge;
      cat.knowledgeRevision = KB_REVISION;
      cat.script = [];
      // Keep playbook mirror for any legacy readers
      cat.playbook = this.knowledgeToPlaybook(cat.knowledge) as Category['playbook'];
      if (seed.voiceDefaults) {
        const preferSarah =
          seed.categoryName === 'Real estate' ||
          /hampstead/i.test(seed.knowledge.businessName || '');
        cat.voiceSettings = {
          ...((cat.voiceSettings as object) || {}),
          // Prefer warm Sarah voice for Pakistani real-estate female agent
          elevenLabsVoiceId: preferSarah
            ? SARAH_VOICE_ID
            : cat.voiceSettings?.elevenLabsVoiceId || SARAH_VOICE_ID,
          stability: seed.voiceDefaults.stability,
          similarityBoost: seed.voiceDefaults.similarityBoost,
        } as Category['voiceSettings'];
      }
      await cat.save();

      await this.productModel.deleteMany({ categoryId: cat._id }).exec();
      await this.faqModel.deleteMany({ categoryId: cat._id }).exec();
      await this.objectionModel.deleteMany({ categoryId: cat._id }).exec();
      await this.stageModel.deleteMany({ categoryId: cat._id }).exec();

      if (seed.products.length) {
        await this.productModel.insertMany(
          seed.products.map((p, i) => ({ ...p, categoryId: cat._id, sortOrder: i })),
        );
      }
      if (seed.faqs.length) {
        await this.faqModel.insertMany(
          seed.faqs.map((f) => ({ ...f, categoryId: cat._id })),
        );
      }
      if (seed.objections.length) {
        await this.objectionModel.insertMany(
          seed.objections.map((o) => ({ ...o, categoryId: cat._id })),
        );
      }
      const stages = seed.stages || DEFAULT_SALES_STAGES;
      await this.stageModel.insertMany(
        stages.map((s) => ({ ...s, categoryId: cat._id, active: true })),
      );

      this.invalidate(id);
      this.logger.warn(
        `KB seeded "${seed.categoryName}" → ${seed.knowledge.businessName} (${KB_REVISION})`,
      );
    }

    // Ensure every category has stages
    const all = await this.categoryModel.find().exec();
    for (const cat of all) {
      const count = await this.stageModel.countDocuments({ categoryId: cat._id }).exec();
      if (count === 0) {
        await this.stageModel.insertMany(
          DEFAULT_SALES_STAGES.map((s) => ({
            ...s,
            categoryId: cat._id,
            active: true,
          })),
        );
        this.invalidate(cat._id.toString());
        this.logger.log(`Default stages attached to "${cat.name}"`);
      }
      if (!cat.knowledge?.businessName && cat.playbook?.businessName) {
        cat.knowledge = this.playbookToKnowledge(cat.playbook) as BusinessKnowledge;
        await cat.save();
        this.invalidate(cat._id.toString());
      }
    }
  }

  private playbookToKnowledge(p: Category['playbook']): Partial<BusinessKnowledge> {
    return {
      businessName: p.businessName,
      projectName: p.projectName,
      industry: p.industry,
      agentName: p.agentName,
      agentGender: p.agentGender,
      agentRole: p.agentRole,
      greetingStyle: p.greetingStyle,
      primaryLanguage: p.language,
      supportedLanguages: [p.language || 'urdu'],
      city: p.city,
      country: p.country,
      locationLabel: p.location,
      businessDescription: p.businessInfo,
      companyIntroduction: p.companyDetails,
      propertyTypes: p.products,
      availableSizes: p.sizes,
      priceRanges: p.priceRanges,
      paymentPlans: p.paymentPlans,
      closingStrategy: p.closingStrategy,
      appointmentStrategy: p.appointmentRules,
      doNotSayRules: p.neverMention,
      conversationGoal: (p.salesGoals || []).join('; '),
    };
  }

  private knowledgeToPlaybook(k: BusinessKnowledge): Partial<Category['playbook']> {
    return {
      businessName: k.businessName,
      projectName: k.projectName,
      industry: k.industry,
      agentName: k.agentName,
      agentGender: k.agentGender,
      agentRole: k.agentRole,
      greetingStyle: k.greetingStyle,
      language: k.primaryLanguage || 'urdu',
      city: k.city,
      country: k.country,
      location: k.locationLabel,
      products: k.propertyTypes,
      sizes: k.availableSizes,
      priceRanges: k.priceRanges,
      paymentPlans: k.paymentPlans,
      businessInfo: k.businessDescription,
      companyDetails: k.companyIntroduction,
      closingStrategy: k.closingStrategy,
      appointmentRules: k.appointmentStrategy,
      neverMention: k.doNotSayRules,
      salesGoals: k.callObjectives,
    };
  }

  async warmAll() {
    const cats = await this.categoryModel.find().exec();
    for (const c of cats) {
      await this.getBundle(c._id.toString());
    }
    this.logger.log(`Knowledge cache warmed (${cats.length} categories, rev=${KB_REVISION})`);
  }

  async ensureScaffold(categoryId: string) {
    const oid = new Types.ObjectId(categoryId);
    const count = await this.stageModel.countDocuments({ categoryId: oid }).exec();
    if (count === 0) {
      await this.stageModel.insertMany(
        DEFAULT_SALES_STAGES.map((s) => ({
          ...s,
          categoryId: oid,
          active: true,
        })),
      );
      this.logger.log(`Default stages attached to category ${categoryId}`);
    }
    this.invalidate(categoryId);
  }

  invalidate(categoryId?: string) {
    if (categoryId) this.cache.delete(categoryId);
    else this.cache.clear();
  }

  async getBundle(categoryId: string): Promise<CachedCategoryKnowledge> {
    const hit = this.cache.get(categoryId);
    if (hit) return hit;

    const cat = await this.categoryModel.findById(categoryId).exec();
    if (!cat) throw new NotFoundException('Category not found');

    const oid = cat._id;
    const [products, faqs, objections, stages] = await Promise.all([
      this.productModel.find({ categoryId: oid, status: 'active' }).sort({ sortOrder: 1 }).lean(),
      this.faqModel.find({ categoryId: oid }).sort({ priority: 1 }).lean(),
      this.objectionModel.find({ categoryId: oid }).sort({ priority: 1 }).lean(),
      this.stageModel.find({ categoryId: oid, active: true }).sort({ priority: 1 }).lean(),
    ]);

    const stagesByKey = new Map<string, ConversationStage>();
    for (const s of stages as ConversationStage[]) {
      stagesByKey.set(s.key, s as ConversationStage);
    }

    const bundle: CachedCategoryKnowledge = {
      categoryId,
      categoryName: cat.name,
      knowledge: (cat.knowledge || {}) as BusinessKnowledge,
      products: products as CategoryProduct[],
      faqs: faqs as CategoryFaq[],
      objections: objections as CategoryObjection[],
      stages: stages as ConversationStage[],
      stagesByKey,
      voiceSettings: cat.voiceSettings,
      loadedAt: Date.now(),
    };
    this.cache.set(categoryId, bundle);
    return bundle;
  }

  async getOrCreateCallState(params: {
    callSid: string;
    categoryId: string;
    callSessionId?: string;
    leadId?: string;
    customerName?: string;
  }): Promise<CallConversationStateDocument> {
    let state = await this.stateModel.findOne({ callSid: params.callSid }).exec();
    if (state) return state;

    state = await this.stateModel.create({
      callSid: params.callSid,
      categoryId: new Types.ObjectId(params.categoryId),
      callSessionId: params.callSessionId
        ? new Types.ObjectId(params.callSessionId)
        : undefined,
      leadId: params.leadId ? new Types.ObjectId(params.leadId) : undefined,
      currentStageKey: 'greeting',
      completedStages: [],
      memory: {
        customerName: params.customerName || '',
        customerPurpose: '',
        propertyType: '',
        budget: '',
        locationPreference: '',
        timeline: '',
        investmentPurpose: '',
        paymentPreference: '',
        familySize: '',
        preferredSize: '',
        notes: '',
        appointmentStatus: '',
        conversationSummary: '',
        knownFacts: [],
      },
      recentMessages: [],
    });
    return state;
  }

  async saveCallState(state: CallConversationStateDocument) {
    state.markModified('memory');
    state.markModified('recentMessages');
    state.markModified('completedStages');
    await state.save();
    return state;
  }
}
