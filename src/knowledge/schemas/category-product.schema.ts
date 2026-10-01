import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CategoryProductDocument = HydratedDocument<CategoryProduct>;

@Schema({ timestamps: true, collection: 'category_products' })
export class CategoryProduct {
  @Prop({ type: Types.ObjectId, ref: 'Category', required: true, index: true })
  categoryId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: [String], default: [] })
  availableSizes: string[];

  @Prop({ default: '' })
  price: string;

  @Prop({ default: '' })
  paymentPlan: string;

  @Prop({ type: [String], default: [] })
  features: string[];

  @Prop({ default: 'available' })
  availability: string;

  @Prop({ default: 'active', enum: ['active', 'inactive', 'sold_out'] })
  status: string;

  @Prop({ default: 0 })
  sortOrder: number;
}

export const CategoryProductSchema = SchemaFactory.createForClass(CategoryProduct);
CategoryProductSchema.index({ categoryId: 1, name: 1 });
