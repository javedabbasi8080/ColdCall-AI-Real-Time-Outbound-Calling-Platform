import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ElevenLabsService } from '../calls/elevenlabs.service';
import { ConversationTurn } from '../calls/schemas/conversation-turn.schema';
import { Lead, LeadStatus } from '../leads/schemas/lead.schema';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Lead.name) private readonly leadModel: Model<Lead>,
    @InjectModel(ConversationTurn.name)
    private readonly turnModel: Model<ConversationTurn>,
    private readonly elevenLabsService: ElevenLabsService,
  ) {}

  async getOverview() {
    const [
      totalLeads,
      totalCalled,
      interested,
      notInterested,
      callbacks,
      voicemails,
      failed,
    ] = await Promise.all([
      this.leadModel.countDocuments({ deletedAt: null }).exec(),
      this.leadModel.countDocuments({
        deletedAt: null,
        status: { $nin: [LeadStatus.PENDING] },
      }).exec(),
      this.leadModel.countDocuments({ status: LeadStatus.INTERESTED, deletedAt: null }).exec(),
      this.leadModel.countDocuments({ status: LeadStatus.NOT_INTERESTED, deletedAt: null }).exec(),
      this.leadModel.countDocuments({ status: LeadStatus.CALLBACK, deletedAt: null }).exec(),
      this.leadModel.countDocuments({ status: LeadStatus.VOICEMAIL, deletedAt: null }).exec(),
      this.leadModel.countDocuments({ status: LeadStatus.FAILED, deletedAt: null }).exec(),
    ]);

    const conversionRate = totalCalled > 0 ? (interested / totalCalled) * 100 : 0;

    return {
      totalLeads,
      totalCalled,
      interested,
      notInterested,
      callbacks,
      voicemails,
      failed,
      conversionRate: Math.round(conversionRate * 100) / 100,
    };
  }

  async getByCategory() {
    return this.leadModel.aggregate([
      { $match: { deletedAt: null } },
      {
        $group: {
          _id: '$category',
          total: { $sum: 1 },
          interested: {
            $sum: { $cond: [{ $eq: ['$status', LeadStatus.INTERESTED] }, 1, 0] },
          },
          notInterested: {
            $sum: { $cond: [{ $eq: ['$status', LeadStatus.NOT_INTERESTED] }, 1, 0] },
          },
          callbacks: {
            $sum: { $cond: [{ $eq: ['$status', LeadStatus.CALLBACK] }, 1, 0] },
          },
          voicemails: {
            $sum: { $cond: [{ $eq: ['$status', LeadStatus.VOICEMAIL] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $eq: ['$status', LeadStatus.FAILED] }, 1, 0] },
          },
          called: {
            $sum: {
              $cond: [{ $ne: ['$status', LeadStatus.PENDING] }, 1, 0],
            },
          },
        },
      },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          categoryId: '$_id',
          categoryName: '$category.name',
          total: 1,
          called: 1,
          interested: 1,
          notInterested: 1,
          callbacks: 1,
          voicemails: 1,
          failed: 1,
        },
      },
    ]);
  }

  async getByBatch(csvBatchId: string) {
    return this.leadModel.aggregate([
      {
        $match: {
          csvBatch: new Types.ObjectId(csvBatchId),
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);
  }

  async getDaily(startDate?: string, endDate?: string) {
    const match: Record<string, unknown> = { deletedAt: null, lastCalledAt: { $exists: true } };
    if (startDate || endDate) {
      match.lastCalledAt = {
        ...(startDate ? { $gte: new Date(startDate) } : {}),
        ...(endDate ? { $lte: new Date(endDate) } : {}),
      };
    }

    return this.leadModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$lastCalledAt' },
          },
          total: { $sum: 1 },
          interested: {
            $sum: { $cond: [{ $eq: ['$status', LeadStatus.INTERESTED] }, 1, 0] },
          },
          notInterested: {
            $sum: { $cond: [{ $eq: ['$status', LeadStatus.NOT_INTERESTED] }, 1, 0] },
          },
          callbacks: {
            $sum: { $cond: [{ $eq: ['$status', LeadStatus.CALLBACK] }, 1, 0] },
          },
          voicemails: {
            $sum: { $cond: [{ $eq: ['$status', LeadStatus.VOICEMAIL] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $eq: ['$status', LeadStatus.FAILED] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

  async getConversionRate(categoryId?: string, batchId?: string) {
    const match: Record<string, unknown> = { deletedAt: null };
    if (categoryId) match.category = new Types.ObjectId(categoryId);
    if (batchId) match.csvBatch = new Types.ObjectId(batchId);

    const [result] = await this.leadModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          called: {
            $sum: {
              $cond: [{ $ne: ['$status', LeadStatus.PENDING] }, 1, 0],
            },
          },
          interested: {
            $sum: { $cond: [{ $eq: ['$status', LeadStatus.INTERESTED] }, 1, 0] },
          },
          scheduled: {
            $sum: { $cond: [{ $eq: ['$status', LeadStatus.CALLBACK] }, 1, 0] },
          },
        },
      },
    ]);

    const data = result || { total: 0, called: 0, interested: 0, scheduled: 0 };
    return {
      total: data.total,
      called: data.called,
      interested: data.interested,
      scheduled: data.scheduled,
      calledRate: data.total ? (data.called / data.total) * 100 : 0,
      interestRate: data.called ? (data.interested / data.called) * 100 : 0,
      scheduleRate: data.interested
        ? (data.scheduled / data.interested) * 100
        : 0,
    };
  }

  async getElevenLabsUsage() {
    const [dbChars] = await this.turnModel.aggregate([
      {
        $group: {
          _id: null,
          totalCharacters: { $sum: '$charactersSynthesized' },
        },
      },
    ]);

    return {
      totalCharactersSynthesized:
        (dbChars?.totalCharacters || 0) + this.elevenLabsService.getTotalCharactersSynthesized(),
      note: 'Includes persisted turns and current session runtime counter',
    };
  }
}
