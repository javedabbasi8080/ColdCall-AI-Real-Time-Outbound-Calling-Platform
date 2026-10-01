import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../auth/schemas/user.schema';
import { KnowledgeAdminService } from './knowledge-admin.service';

@Controller('knowledge')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KnowledgeController {
  constructor(private readonly admin: KnowledgeAdminService) {}

  @Get('categories/:categoryId/bundle')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT)
  getBundle(@Param('categoryId') categoryId: string) {
    return this.admin.getFullBundle(categoryId);
  }

  @Get('categories/:categoryId/products')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT)
  listProducts(@Param('categoryId') categoryId: string) {
    return this.admin.listProducts(categoryId);
  }

  @Post('categories/:categoryId/products')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  createProduct(@Param('categoryId') categoryId: string, @Body() body: Record<string, unknown>) {
    return this.admin.createProduct(categoryId, body);
  }

  @Put('products/:id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  updateProduct(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.admin.updateProduct(id, body);
  }

  @Delete('products/:id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  deleteProduct(@Param('id') id: string) {
    return this.admin.deleteProduct(id);
  }

  @Get('categories/:categoryId/faqs')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT)
  listFaqs(@Param('categoryId') categoryId: string) {
    return this.admin.listFaqs(categoryId);
  }

  @Post('categories/:categoryId/faqs')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  createFaq(@Param('categoryId') categoryId: string, @Body() body: Record<string, unknown>) {
    return this.admin.createFaq(categoryId, body);
  }

  @Put('faqs/:id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  updateFaq(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.admin.updateFaq(id, body);
  }

  @Delete('faqs/:id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  deleteFaq(@Param('id') id: string) {
    return this.admin.deleteFaq(id);
  }

  @Get('categories/:categoryId/objections')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT)
  listObjections(@Param('categoryId') categoryId: string) {
    return this.admin.listObjections(categoryId);
  }

  @Post('categories/:categoryId/objections')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  createObjection(
    @Param('categoryId') categoryId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.admin.createObjection(categoryId, body);
  }

  @Put('objections/:id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  updateObjection(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.admin.updateObjection(id, body);
  }

  @Delete('objections/:id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  deleteObjection(@Param('id') id: string) {
    return this.admin.deleteObjection(id);
  }

  @Get('categories/:categoryId/stages')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT)
  listStages(@Param('categoryId') categoryId: string) {
    return this.admin.listStages(categoryId);
  }

  @Post('categories/:categoryId/stages')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  createStage(@Param('categoryId') categoryId: string, @Body() body: Record<string, unknown>) {
    return this.admin.createStage(categoryId, body);
  }

  @Put('stages/:id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  updateStage(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.admin.updateStage(id, body);
  }

  @Delete('stages/:id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  deleteStage(@Param('id') id: string) {
    return this.admin.deleteStage(id);
  }

  @Put('categories/:categoryId/business')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  updateBusiness(
    @Param('categoryId') categoryId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.admin.updateBusinessKnowledge(categoryId, body);
  }

  @Get('calls/:callSid/state')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT)
  getCallState(@Param('callSid') callSid: string) {
    return this.admin.getCallState(callSid);
  }

  @Post('cache/invalidate/:categoryId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  invalidate(@Param('categoryId') categoryId: string) {
    return this.admin.invalidateCache(categoryId);
  }
}
