import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SynthesizeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string;

  @IsOptional()
  @IsString()
  voiceId?: string;

  @IsOptional()
  @IsString()
  modelId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  stability?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  similarityBoost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  style?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.7)
  @Max(1.2)
  speed?: number;

  @IsOptional()
  @IsBoolean()
  useSpeakerBoost?: boolean;
}
