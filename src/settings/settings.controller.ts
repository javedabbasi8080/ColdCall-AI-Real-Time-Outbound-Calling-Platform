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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { UpsertSettingDto } from './dto/upsert-setting.dto';
import { SettingsGroup } from './schemas/app-settings.schema';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  listAll() {
    return this.settingsService.listAllMasked();
  }

  @Put(':key')
  @Roles(UserRole.ADMIN)
  upsert(
    @Param('key') key: string,
    @Body() dto: UpsertSettingDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.settingsService.upsert(key, dto, userId);
  }

  @Delete(':key')
  @Roles(UserRole.ADMIN)
  async delete(@Param('key') key: string) {
    await this.settingsService.delete(key);
    return { deleted: true };
  }

  @Post('test/:group')
  @Roles(UserRole.ADMIN)
  testGroup(@Param('group') group: SettingsGroup) {
    return this.settingsService.testGroup(group);
  }
}
