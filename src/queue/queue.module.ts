import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { CallsModule } from '../calls/calls.module';
import { Lead, LeadSchema } from '../leads/schemas/lead.schema';
import { LeadsModule } from '../leads/leads.module';
import { CallProcessor, COLD_CALL_QUEUE } from './call.processor';
import { CallbackScheduler } from './callback.scheduler';
import { PendingLeadsScheduler } from './pending-leads.scheduler';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: config.get<string>('redisUrl') || 'redis://localhost:6379',
      }),
    }),
    BullModule.registerQueue({ name: COLD_CALL_QUEUE }),
    MongooseModule.forFeature([{ name: Lead.name, schema: LeadSchema }]),
    CallsModule,
    LeadsModule,
  ],
  providers: [CallProcessor, CallbackScheduler, PendingLeadsScheduler],
  exports: [BullModule],
})
export class QueueModule {}
