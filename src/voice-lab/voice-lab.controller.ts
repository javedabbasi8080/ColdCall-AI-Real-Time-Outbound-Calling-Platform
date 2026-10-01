import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SynthesizeDto } from './dto/synthesize.dto';
import { VoiceLabService } from './voice-lab.service';

@Controller('voice-lab')
@UseGuards(JwtAuthGuard)
export class VoiceLabController {
  constructor(private readonly voiceLab: VoiceLabService) {}

  @Get('voices')
  voices() {
    return this.voiceLab.listVoices();
  }

  @Get('models')
  models() {
    return this.voiceLab.listModels();
  }

  @Post('synthesize')
  async synthesize(@Body() dto: SynthesizeDto) {
    const buffer = await this.voiceLab.synthesize(dto);
    return {
      mime: 'audio/mpeg',
      chars: dto.text.length,
      bytes: buffer.length,
      audioBase64: buffer.toString('base64'),
    };
  }
}
