import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Job } from 'bull';
import { DateTime } from 'luxon';
import { Model } from 'mongoose';
import { CallService } from '../calls/call.service';
import { Lead, LeadDocument, LeadStatus } from '../leads/schemas/lead.schema';
import { SettingsService } from '../settings/settings.service';

export const COLD_CALL_QUEUE = 'cold-call-queue';

export interface ColdCallJobPayload {
  leadId: string;
  priority: number;
  attemptNumber: number;
}

@Processor(COLD_CALL_QUEUE)
export class CallProcessor {
  private readonly logger = new Logger(CallProcessor.name);

  constructor(
    private readonly callService: CallService,
    private readonly settingsService: SettingsService,
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
  ) {}

  @Process({ concurrency: 5 })
  async handleCall(job: Job<ColdCallJobPayload>) {
    const { leadId, attemptNumber } = job.data;
    const lead = await this.leadModel.findById(leadId).exec();

    if (!lead || lead.deletedAt) {
      this.logger.warn(`Lead ${leadId} not found or deleted, skipping`);
      return;
    }

    if ([LeadStatus.NOT_INTERESTED, LeadStatus.DO_NOT_CALL].includes(lead.status)) {
      this.logger.log(`Lead ${leadId} status ${lead.status}, skipping`);
      return;
    }

    const withinHours = await this.isWithinCallingHours(lead.timezone);
    if (!withinHours) {
      const delay = await this.getDelayUntilNextWindow(lead.timezone);
      this.logger.log(`Lead ${leadId} outside calling hours, delaying ${delay}ms`);
      await job.queue.add(job.data, { delay, priority: job.data.priority });
      return;
    }

    try {
      await this.callService.startCall(leadId);
      this.logger.log(`Call started for lead ${leadId}`);
    } catch (err) {
      this.logger.error(`Call failed for lead ${leadId}: ${(err as Error).message}`);
      if (attemptNumber >= 3) {
        await this.leadModel.findByIdAndUpdate(leadId, { status: LeadStatus.FAILED }).exec();
      } else {
        const delay = Math.pow(2, attemptNumber) * 60 * 1000;
        await job.queue.add(
          { leadId, priority: job.data.priority, attemptNumber: attemptNumber + 1 },
          { delay, priority: job.data.priority },
        );
      }
      throw err;
    }
  }

  private async isWithinCallingHours(timezone: string): Promise<boolean> {
    const startStr = (await this.settingsService.get('CALL_HOURS_START')) || '09:00';
    const endStr = (await this.settingsService.get('CALL_HOURS_END')) || '17:00';
    const now = DateTime.now().setZone(timezone);
    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    const start = now.set({ hour: startH, minute: startM, second: 0 });
    const end = now.set({ hour: endH, minute: endM, second: 0 });
    return now >= start && now <= end;
  }

  private async getDelayUntilNextWindow(timezone: string): Promise<number> {
    const startStr = (await this.settingsService.get('CALL_HOURS_START')) || '09:00';
    const [startH, startM] = startStr.split(':').map(Number);
    const now = DateTime.now().setZone(timezone);
    let nextStart = now.set({ hour: startH, minute: startM, second: 0 });
    if (now > nextStart) {
      nextStart = nextStart.plus({ days: 1 });
    }
    return nextStart.toMillis() - now.toMillis();
  }
}
