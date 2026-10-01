import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CallsModule } from '../calls/calls.module';
import { ConversationTurn, ConversationTurnSchema } from '../calls/schemas/conversation-turn.schema';
import { Lead, LeadSchema } from '../leads/schemas/lead.schema';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: ConversationTurn.name, schema: ConversationTurnSchema },
    ]),
    CallsModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
