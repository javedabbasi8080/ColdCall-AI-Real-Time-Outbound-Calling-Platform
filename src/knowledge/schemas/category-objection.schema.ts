import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CategoryObjectionDocument = HydratedDocument<CategoryObjection>;

@Schema({ timestamps: true, collection: 'category_objections' })
export class CategoryObjection {
  @Prop({ type: Types.ObjectId, ref: 'Category', required: true, index: true })
  categoryId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  triggerPatterns: string;

  @Prop({ type: [String], default: [] })
  handlingStrategies: string[];

  @Prop({ default: 100 })
  priority: number;
}

export const CategoryObjectionSchema = SchemaFactory.createForClass(CategoryObjection);
CategoryObjectionSchema.index({ categoryId: 1, name: 1 });
