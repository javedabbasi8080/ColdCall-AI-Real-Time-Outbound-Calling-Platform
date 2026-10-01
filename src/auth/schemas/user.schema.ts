import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum UserRole {
  ADMIN = 'admin',
  AGENT = 'agent',
  MANAGER = 'manager',
}

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: UserRole, default: UserRole.AGENT })
  role: UserRole;
}

export const UserSchema = SchemaFactory.createForClass(User);
