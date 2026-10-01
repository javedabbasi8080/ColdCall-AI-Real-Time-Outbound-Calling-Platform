import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class ScriptStepDto {
  @IsNumber()
  step: number;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  expectedResponses?: string[];

  @IsString()
  @IsOptional()
  objectionRebuttal?: string;
}

class FaqDto {
  @IsString()
  @IsOptional()
  question?: string;

  @IsString()
  @IsOptional()
  answer?: string;
}

class PlaybookDto {
  @IsString()
  @IsOptional()
  businessName?: string;

  @IsString()
  @IsOptional()
  projectName?: string;

  @IsString()
  @IsOptional()
  industry?: string;

  @IsString()
  @IsOptional()
  agentName?: string;

  @IsString()
  @IsOptional()
  agentGender?: string;

  @IsString()
  @IsOptional()
  agentRole?: string;

  @IsString()
  @IsOptional()
  greetingStyle?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  products?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  inventory?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  sizes?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  priceRanges?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  paymentPlans?: string[];

  @IsString()
  @IsOptional()
  businessInfo?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  qualificationTopics?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  salesGoals?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  objectionHandling?: string[];

  @IsString()
  @IsOptional()
  closingStrategy?: string;

  @IsString()
  @IsOptional()
  appointmentRules?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FaqDto)
  @IsOptional()
  faqs?: FaqDto[];

  @IsString()
  @IsOptional()
  companyDetails?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  neverMention?: string[];
}

class VoiceSettingsDto {
  @IsString()
  @IsOptional()
  elevenLabsVoiceId?: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  stability?: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  similarityBoost?: number;
}

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @ValidateNested()
  @Type(() => PlaybookDto)
  @IsOptional()
  playbook?: PlaybookDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScriptStepDto)
  @IsOptional()
  script?: ScriptStepDto[];

  @ValidateNested()
  @Type(() => VoiceSettingsDto)
  @IsOptional()
  voiceSettings?: VoiceSettingsDto;
}

export class UpdateCategoryDto extends CreateCategoryDto {}
