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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/create-category.dto';

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT)
  findAll() {
    return this.categoriesService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT)
  findOne(@Param('id') id: string) {
    return this.categoriesService.findById(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  delete(@Param('id') id: string) {
    return this.categoriesService.delete(id);
  }
}
