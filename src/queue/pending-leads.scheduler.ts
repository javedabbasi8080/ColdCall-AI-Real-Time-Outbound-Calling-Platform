import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Queue } from 'bull';
import { LeadsService } from '../leads/leads.service';
import { SettingsService } from '../settings/settings.service';
import { COLD_CALL_QUEUE } from './call.processor';

@Injectable()
export class PendingLeadsScheduler {
  private readonly logger = new Logger(PendingLeadsScheduler.name);

  constructor(
    private readonly leadsService: LeadsService,
    private readonly settingsService: SettingsService,
    @InjectQueue(COLD_CALL_QUEUE) private readonly callQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async enqueuePendingLeads() {
    const maxConcurrent = parseInt(
      (await this.settingsService.get('MAX_CONCURRENT_CALLS')) || '5',
      10,
    );
    const activeCount = await this.callQueue.getActiveCount();
    const available = Math.max(0, maxConcurrent - activeCount);
    if (available === 0) return;

    const leads = await this.leadsService.findPendingForQueue(available);
    for (const lead of leads) {
      const leadId = lead._id.toString();
      try {
        await this.callQueue.add(
          { leadId, priority: 5, attemptNumber: 1 },
          { priority: 5, jobId: `pending-${leadId}` },
        );
        this.logger.log(`Queued pending lead ${leadId}`);
      } catch {
        // Job already queued for this lead
      }
    }
  }
}
