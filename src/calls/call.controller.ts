import {
  Controller,
  Get,
  Header,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../auth/schemas/user.schema';
import { CallService } from './call.service';
import { CallQueryDto } from './dto/call-query.dto';
import { ElevenLabsService } from './elevenlabs.service';
import { TwilioSignatureGuard } from './guards/twilio-signature.guard';

@Controller('calls')
export class CallController {
  private readonly logger = new Logger(CallController.name);

  constructor(
    private readonly callService: CallService,
    private readonly elevenLabsService: ElevenLabsService,
  ) {}

  @Post('start/:leadId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT)
  startCall(@Param('leadId') leadId: string) {
    this.logger.log(`Start call requested for lead ${leadId}`);
    return this.callService.startCall(leadId);
  }

  @Post('webhook/voice')
  @UseGuards(TwilioSignatureGuard)
  @Header('Content-Type', 'text/xml')
  async voiceWebhook(
    @Req()
    req: {
      body: {
        CallSid?: string;
        Direction?: string;
        From?: string;
        To?: string;
        CallStatus?: string;
      };
    },
  ) {
    const callSid = req.body.CallSid || '';
    const direction = req.body.Direction || '';
    const from = req.body.From || '';
    const to = req.body.To || '';
    this.logger.log(
      `Twilio voice webhook CallSid=${callSid} Direction=${direction} From=${from} To=${to} Status=${req.body.CallStatus || ''}`,
    );
    try {
      return await this.callService.handleVoiceWebhook(callSid, {
        direction,
        from,
        to,
      });
    } catch (err) {
      this.logger.error(
        `Voice webhook failed CallSid=${callSid}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      await this.callService.markCallFailed(callSid, (err as Error).message);
      // Never let Twilio show "application error" silence — speak a short recovery line
      return this.callService.voiceErrorFallback();
    }
  }

  @Post('webhook/gather')
  @UseGuards(TwilioSignatureGuard)
  @Header('Content-Type', 'text/xml')
  async gatherWebhook(
    @Req() req: { body: { CallSid?: string; SpeechResult?: string } },
  ) {
    const callSid = req.body.CallSid || '';
    const speechResult = req.body.SpeechResult;
    this.logger.log(
      `Twilio gather webhook CallSid=${callSid} speech="${(speechResult || '').slice(0, 80)}"`,
    );
    try {
      return await this.callService.handleGatherWebhook(callSid, speechResult);
    } catch (err) {
      this.logger.error(
        `Gather webhook failed CallSid=${callSid}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      return this.callService.gatherErrorFallback();
    }
  }

  @Post('webhook/continue')
  @UseGuards(TwilioSignatureGuard)
  @Header('Content-Type', 'text/xml')
  async gatherContinue(@Req() req: { body: { CallSid?: string } }) {
    const callSid = req.body.CallSid || '';
    return this.callService.handleGatherContinue(callSid);
  }

  @Post('webhook/status')
  @UseGuards(TwilioSignatureGuard)
  async statusWebhook(
    @Req() req: { body: { CallSid?: string; CallStatus?: string; CallDuration?: string } },
  ) {
    this.logger.log(
      `Twilio status webhook CallSid=${req.body.CallSid} status=${req.body.CallStatus}`,
    );
    await this.callService.handleStatusWebhook(
      req.body.CallSid || '',
      req.body.CallStatus || '',
      req.body.CallDuration,
    );
    return { received: true };
  }

  @Get('serve-audio/:audioId')
  serveAudio(@Param('audioId') audioId: string, @Res() res: Response) {
    const buffer = this.elevenLabsService.getAudioBuffer(audioId);
    if (!buffer) {
      return res.status(404).send('Audio not found');
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    return res.send(buffer);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT)
  findAll(@Query() query: CallQueryDto) {
    return this.callService.findAll(query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT)
  findOne(@Param('id') id: string) {
    return this.callService.findById(id);
  }

  @Get(':id/transcript')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT)
  getTranscript(@Param('id') id: string) {
    return this.callService.getTranscript(id);
  }

  @Get(':id/audio')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.AGENT)
  getAudio(@Param('id') id: string) {
    return this.callService.getAudioUrls(id);
  }
}
