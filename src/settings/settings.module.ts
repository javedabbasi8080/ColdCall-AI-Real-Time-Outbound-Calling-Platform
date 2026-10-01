import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppSettings, AppSettingsSchema } from './schemas/app-settings.schema';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AppSettings.name, schema: AppSettingsSchema },
    ]),
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
