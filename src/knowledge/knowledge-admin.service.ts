import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { KnowledgeCacheService } from './knowledge-cache.service';
import { BusinessKnowledge } from './schemas/business-knowledge.schema';
import {
  CallConversationState,
  CallConversationStateDocument,
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

@Injectable()
export class KnowledgeAdminService {
  constructor(
    private readonly cache: KnowledgeCacheService,
    @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(CategoryProduct.name)
    private readonly productModel: Model<CategoryProductDocument>,
    @InjectModel(CategoryFaq.name) private readonly faqModel: Model<CategoryFaqDocument>,
    @InjectModel(CategoryObjection.name)
    private readonly objectionModel: Model<CategoryObjectionDocument>,
    @InjectModel(ConversationStage.name)
    private readonly stageModel: Model<ConversationStageDocument>,
    @InjectModel(CallConversationState.name)
    private readonly stateModel: Model<CallConversationStateDocument>,
  ) {}

  async getFullBundle(categoryId: string) {
    const bundle = await this.cache.getBundle(categoryId);
    return {
      categoryId: bundle.categoryId,
      categoryName: bundle.categoryName,
      knowledge: bundle.knowledge,
      products: bundle.products,
      faqs: bundle.faqs,
      objections: bundle.objections,
      stages: bundle.stages,
      voiceSettings: bundle.voiceSettings,
    };
  }

  listProducts(categoryId: string) {
    return this.productModel
      .find({ categoryId: new Types.ObjectId(categoryId) })
      .sort({ sortOrder: 1 })
      .exec();
  }

  async createProduct(categoryId: string, body: Record<string, unknown>) {
    const doc = await this.productModel.create({
      ...body,
      categoryId: new Types.ObjectId(categoryId),
    });
    this.cache.invalidate(categoryId);
    return doc;
  }

  async updateProduct(id: string, body: Record<string, unknown>) {
    const doc = await this.productModel.findByIdAndUpdate(id, body, { new: true }).exec();
    if (!doc) throw new NotFoundException('Product not found');
    this.cache.invalidate(doc.categoryId.toString());
    return doc;
  }

  async deleteProduct(id: string) {
    const doc = await this.productModel.findByIdAndDelete(id).exec();
    if (!doc) throw new NotFoundException('Product not found');
    this.cache.invalidate(doc.categoryId.toString());
    return { deleted: true };
  }

  listFaqs(categoryId: string) {
    return this.faqModel
      .find({ categoryId: new Types.ObjectId(categoryId) })
      .sort({ priority: 1 })
      .exec();
  }

  async createFaq(categoryId: string, body: Record<string, unknown>) {
    const doc = await this.faqModel.create({
      ...body,
      categoryId: new Types.ObjectId(categoryId),
    });
    this.cache.invalidate(categoryId);
    return doc;
  }

  async updateFaq(id: string, body: Record<string, unknown>) {
    const doc = await this.faqModel.findByIdAndUpdate(id, body, { new: true }).exec();
    if (!doc) throw new NotFoundException('FAQ not found');
    this.cache.invalidate(doc.categoryId.toString());
    return doc;
  }

  async deleteFaq(id: string) {
    const doc = await this.faqModel.findByIdAndDelete(id).exec();
    if (!doc) throw new NotFoundException('FAQ not found');
    this.cache.invalidate(doc.categoryId.toString());
    return { deleted: true };
  }

  listObjections(categoryId: string) {
    return this.objectionModel
      .find({ categoryId: new Types.ObjectId(categoryId) })
      .sort({ priority: 1 })
      .exec();
  }

  async createObjection(categoryId: string, body: Record<string, unknown>) {
    const doc = await this.objectionModel.create({
      ...body,
      categoryId: new Types.ObjectId(categoryId),
    });
    this.cache.invalidate(categoryId);
    return doc;
  }

  async updateObjection(id: string, body: Record<string, unknown>) {
    const doc = await this.objectionModel.findByIdAndUpdate(id, body, { new: true }).exec();
    if (!doc) throw new NotFoundException('Objection not found');
    this.cache.invalidate(doc.categoryId.toString());
    return doc;
  }

  async deleteObjection(id: string) {
    const doc = await this.objectionModel.findByIdAndDelete(id).exec();
    if (!doc) throw new NotFoundException('Objection not found');
    this.cache.invalidate(doc.categoryId.toString());
    return { deleted: true };
  }

  listStages(categoryId: string) {
    return this.stageModel
      .find({ categoryId: new Types.ObjectId(categoryId) })
      .sort({ priority: 1 })
      .exec();
  }

  async createStage(categoryId: string, body: Record<string, unknown>) {
    const doc = await this.stageModel.create({
      ...body,
      categoryId: new Types.ObjectId(categoryId),
    });
    this.cache.invalidate(categoryId);
    return doc;
  }

  async updateStage(id: string, body: Record<string, unknown>) {
    const doc = await this.stageModel.findByIdAndUpdate(id, body, { new: true }).exec();
    if (!doc) throw new NotFoundException('Stage not found');
    this.cache.invalidate(doc.categoryId.toString());
    return doc;
  }

  async deleteStage(id: string) {
    const doc = await this.stageModel.findByIdAndDelete(id).exec();
    if (!doc) throw new NotFoundException('Stage not found');
    this.cache.invalidate(doc.categoryId.toString());
    return { deleted: true };
  }

  async updateBusinessKnowledge(categoryId: string, body: Record<string, unknown>) {
    const cat = await this.categoryModel.findById(categoryId).exec();
    if (!cat) throw new NotFoundException('Category not found');
    cat.knowledge = {
      ...(cat.knowledge as object),
      ...body,
    } as unknown as BusinessKnowledge;
    await cat.save();
    this.cache.invalidate(categoryId);
    return cat.knowledge;
  }

  async getCallState(callSid: string) {
    const state = await this.stateModel.findOne({ callSid }).exec();
    if (!state) throw new NotFoundException('Call state not found');
    return state;
  }

  invalidateCache(categoryId: string) {
    this.cache.invalidate(categoryId);
    return { invalidated: categoryId };
  }
}
