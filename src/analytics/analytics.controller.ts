import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../auth/schemas/user.schema';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  overview() {
    return this.analyticsService.getOverview();
  }

  @Get('by-category')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  byCategory() {
    return this.analyticsService.getByCategory();
  }

  @Get('by-batch/:csvBatchId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  byBatch(@Param('csvBatchId') csvBatchId: string) {
    return this.analyticsService.getByBatch(csvBatchId);
  }

  @Get('daily')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  daily(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getDaily(startDate, endDate);
  }

  @Get('conversion-rate')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  conversionRate(
    @Query('categoryId') categoryId?: string,
    @Query('batchId') batchId?: string,
  ) {
    return this.analyticsService.getConversionRate(categoryId, batchId);
  }

  @Get('elevenlabs-usage')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  elevenLabsUsage() {
    return this.analyticsService.getElevenLabsUsage();
  }
}
