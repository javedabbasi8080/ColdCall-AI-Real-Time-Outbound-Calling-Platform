import { IsEnum, IsOptional, IsString } from 'class-validator';
import { LeadStatus } from '../schemas/lead.schema';

export class UpdateLeadStatusDto {
  @IsEnum(LeadStatus)
  status: LeadStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}
