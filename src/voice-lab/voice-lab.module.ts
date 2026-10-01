import { Module } from '@nestjs/common';
import { VoiceLabController } from './voice-lab.controller';
import { VoiceLabService } from './voice-lab.service';

/**
 * Isolated ElevenLabs voice testing module.
 * Depends only on the global SettingsService for the API key.
 * Kept fully separate from the live call pipeline.
 */
@Module({
  controllers: [VoiceLabController],
  providers: [VoiceLabService],
})
export class VoiceLabModule {}
