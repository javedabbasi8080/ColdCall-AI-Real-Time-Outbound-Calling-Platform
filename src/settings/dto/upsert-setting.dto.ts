import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { SettingsGroup } from '../schemas/app-settings.schema';

export class UpsertSettingDto {
  @IsString()
  @IsNotEmpty()
  value: string;

  @IsString()
  @IsNotEmpty()
  label: string;

  @IsEnum(SettingsGroup)
  group: SettingsGroup;
}
