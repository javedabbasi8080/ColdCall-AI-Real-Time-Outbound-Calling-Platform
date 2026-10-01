import { IsDateString, IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CallOutcome, CallSessionStatus } from '../schemas/call-session.schema';

export class CallQueryDto extends PaginationDto {
  @IsOptional()
  @IsMongoId()
  leadId?: string;

  @IsOptional()
  @IsEnum(CallSessionStatus)
  status?: CallSessionStatus;

  @IsOptional()
  @IsEnum(CallOutcome)
  outcome?: CallOutcome;

  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
