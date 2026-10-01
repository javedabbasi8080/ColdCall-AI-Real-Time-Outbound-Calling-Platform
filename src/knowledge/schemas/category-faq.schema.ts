import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CategoryFaqDocument = HydratedDocument<CategoryFaq>;

@Schema({ timestamps: true, collection: 'category_faqs' })
export class CategoryFaq {
  @Prop({ type: Types.ObjectId, ref: 'Category', required: true, index: true })
  categoryId: Types.ObjectId;

  @Prop({ required: true })
  question: string;

  @Prop({ required: true })
  answer: string;

  @Prop({ default: 100 })
  priority: number;

  @Prop({ type: [String], default: [] })
  keywords: string[];
}

export const CategoryFaqSchema = SchemaFactory.createForClass(CategoryFaq);
CategoryFaqSchema.index({ categoryId: 1, priority: 1 });
