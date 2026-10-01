import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CategoriesModule } from '../categories/categories.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { Lead, LeadSchema } from '../leads/schemas/lead.schema';
import { CallController } from './call.controller';
import { CallService } from './call.service';
import { ElevenLabsService } from './elevenlabs.service';
import { TwilioSignatureGuard } from './guards/twilio-signature.guard';
import { MediaStreamServer } from './realtime/media-stream.server';
import { CallUsageService } from './usage/call-usage.service';
import { ScriptEngineService } from './script-engine.service';
import { CallSession, CallSessionSchema } from './schemas/call-session.schema';
import {
  ConversationTurn,
  ConversationTurnSchema,
} from './schemas/conversation-turn.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CallSession.name, schema: CallSessionSchema },
      { name: ConversationTurn.name, schema: ConversationTurnSchema },
      { name: Lead.name, schema: LeadSchema },
    ]),
    CategoriesModule,
    KnowledgeModule,
  ],
  controllers: [CallController],
  providers: [
    CallService,
    ElevenLabsService,
    ScriptEngineService,
    CallUsageService,
    TwilioSignatureGuard,
    MediaStreamServer,
  ],
  exports: [CallService, ElevenLabsService, MediaStreamServer],
})
export class CallsModule {}
