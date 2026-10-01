import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Category, CategorySchema } from '../categories/schemas/category.schema';
import { SettingsModule } from '../settings/settings.module';
import { ConversationAgentFactory } from './conversation-agent.factory';
import { KnowledgeAdminService } from './knowledge-admin.service';
import { KnowledgeCacheService } from './knowledge-cache.service';
import { KnowledgeController } from './knowledge.controller';
import { LiveSearchService } from './live-search.service';
import { MemoryEngineService } from './memory-engine.service';
import { PromptBuilderService } from './prompt-builder.service';
import { StageEngineService } from './stage-engine.service';
import {
  CallConversationState,
  CallConversationStateSchema,
} from './schemas/call-conversation-state.schema';
import { CategoryFaq, CategoryFaqSchema } from './schemas/category-faq.schema';
import {
  CategoryObjection,
  CategoryObjectionSchema,
} from './schemas/category-objection.schema';
import {
  CategoryProduct,
  CategoryProductSchema,
} from './schemas/category-product.schema';
import {
  ConversationStage,
  ConversationStageSchema,
} from './schemas/conversation-stage.schema';

@Module({
  imports: [
    SettingsModule,
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
      { name: CategoryProduct.name, schema: CategoryProductSchema },
      { name: CategoryFaq.name, schema: CategoryFaqSchema },
      { name: CategoryObjection.name, schema: CategoryObjectionSchema },
      { name: ConversationStage.name, schema: ConversationStageSchema },
      { name: CallConversationState.name, schema: CallConversationStateSchema },
    ]),
  ],
  controllers: [KnowledgeController],
  providers: [
    KnowledgeCacheService,
    KnowledgeAdminService,
    MemoryEngineService,
    StageEngineService,
    PromptBuilderService,
    LiveSearchService,
    ConversationAgentFactory,
  ],
  exports: [
    KnowledgeCacheService,
    ConversationAgentFactory,
    MemoryEngineService,
    StageEngineService,
    PromptBuilderService,
    LiveSearchService,
  ],
})
export class KnowledgeModule {}
