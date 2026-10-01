import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { LeadStatus } from '../schemas/lead.schema';

export class LeadQueryDto extends PaginationDto {
  @IsOptional()
  @IsMongoId()
  category?: string;

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsMongoId()
  batch?: string;
}
