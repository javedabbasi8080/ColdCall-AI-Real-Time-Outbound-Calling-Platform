import { Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { KnowledgeCacheService } from '../knowledge/knowledge-cache.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/create-category.dto';
import { Category, CategoryDocument } from './schemas/category.schema';

@Injectable()
export class CategoriesService implements OnModuleInit {
  private readonly logger = new Logger(CategoriesService.name);
  private readonly cache = new Map<string, { doc: CategoryDocument; at: number }>();
  private readonly CACHE_TTL_MS = 120_000;

  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @Optional() private readonly knowledgeCache?: KnowledgeCacheService,
  ) {}

  async onModuleInit() {
    const all = await this.categoryModel.find().exec();
    for (const cat of all) {
      this.cache.set(cat._id.toString(), { doc: cat, at: Date.now() });
    }
    this.logger.log(
      `Categories cached (${all.length}) — knowledge seeded by KnowledgeModule`,
    );
  }

  private invalidate(id?: string) {
    if (id) this.cache.delete(id);
    else this.cache.clear();
  }

  async create(dto: CreateCategoryDto) {
    const created = await this.categoryModel.create(dto);
    if (this.knowledgeCache) {
      await this.knowledgeCache.ensureScaffold(created._id.toString());
    }
    this.invalidate();
    return created;
  }

  async findAll() {
    return this.categoryModel.find().sort({ name: 1 }).exec();
  }

  async findById(id: string) {
    const hit = this.cache.get(id);
    if (hit && Date.now() - hit.at < this.CACHE_TTL_MS) {
      return hit.doc;
    }
    const category = await this.categoryModel.findById(id).exec();
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    this.cache.set(id, { doc: category, at: Date.now() });
    return category;
  }

  async findByName(name: string) {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const category = await this.categoryModel
      .findOne({
        name: new RegExp(
          `^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
          'i',
        ),
      })
      .exec();
    if (category) {
      this.cache.set(category._id.toString(), { doc: category, at: Date.now() });
    }
    return category;
  }

  async findFirst() {
    const category = await this.categoryModel.findOne().sort({ name: 1 }).exec();
    if (category) {
      this.cache.set(category._id.toString(), { doc: category, at: Date.now() });
    }
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.categoryModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    this.invalidate(id);
    this.knowledgeCache?.invalidate(id);
    this.cache.set(id, { doc: category, at: Date.now() });
    return category;
  }

  async delete(id: string) {
    const result = await this.categoryModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Category not found');
    }
    this.invalidate(id);
    this.knowledgeCache?.invalidate(id);
    return { deleted: true };
  }
}
