import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Queue } from 'bull';
import { LeadsService } from '../leads/leads.service';
import { COLD_CALL_QUEUE } from './call.processor';

@Injectable()
export class CallbackScheduler {
  private readonly logger = new Logger(CallbackScheduler.name);

  constructor(
    private readonly leadsService: LeadsService,
    @InjectQueue(COLD_CALL_QUEUE) private readonly callQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduleCallbacks() {
    const leads = await this.leadsService.findCallbacksDue();
    for (const lead of leads) {
      const leadId = lead._id.toString();
      try {
        await this.callQueue.add(
          { leadId, priority: 1, attemptNumber: 1 },
          { priority: 1, jobId: `callback-${leadId}-${Date.now()}` },
        );
        this.logger.log(`Queued callback for lead ${leadId}`);
      } catch {
        // Skip duplicate callback job
      }
    }
  }
}
