import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { Category, CategorySchema } from './schemas/category.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Category.name, schema: CategorySchema }]),
    forwardRef(() => KnowledgeModule),
  ],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
