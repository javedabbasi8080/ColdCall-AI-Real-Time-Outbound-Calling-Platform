import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CsvBatchDocument = HydratedDocument<CsvBatch>;

@Schema({ timestamps: false })
export class CsvBatch {
  @Prop({ required: true })
  fileName: string;

  @Prop({ default: 0 })
  totalLeads: number;

  @Prop({ default: 0 })
  validLeads: number;

  @Prop({ default: 0 })
  duplicatesSkipped: number;

  @Prop({ type: Types.ObjectId, ref: 'Category', required: true })
  categoryId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uploadedBy: Types.ObjectId;

  @Prop({ default: () => new Date() })
  uploadedAt: Date;
}

export const CsvBatchSchema = SchemaFactory.createForClass(CsvBatch);
