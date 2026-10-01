import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../auth/schemas/user.schema';
import { LeadQueryDto } from './dto/lead-query.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { LeadsService } from './leads.service';

@Controller('leads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post('upload')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT)
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('categoryId') categoryId: string,
    @Body('columnMapping') columnMappingJson: string | undefined,
    @CurrentUser('sub') userId: string,
  ) {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }
    if (!categoryId) {
      throw new BadRequestException('categoryId is required');
    }
    let columnMapping: Record<string, string> | undefined;
    if (columnMappingJson) {
      try {
        columnMapping = JSON.parse(columnMappingJson) as Record<string, string>;
      } catch {
        throw new BadRequestException('columnMapping must be valid JSON');
      }
    }
    return this.leadsService.uploadCsv(
      file.buffer,
      file.originalname,
      categoryId,
      userId,
      columnMapping,
    );
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT)
  findAll(@Query() query: LeadQueryDto) {
    return this.leadsService.findAll(query);
  }

  @Get('batches')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT)
  findBatches() {
    return this.leadsService.findBatches(10);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT)
  findOne(@Param('id') id: string) {
    return this.leadsService.findById(id);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateLeadStatusDto) {
    return this.leadsService.updateStatus(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  delete(@Param('id') id: string) {
    return this.leadsService.softDelete(id);
  }
}
