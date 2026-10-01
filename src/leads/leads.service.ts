import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import csv from 'csv-parser';
import { Model, Types } from 'mongoose';
import { Readable } from 'stream';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { CallSession } from '../calls/schemas/call-session.schema';
import { LeadQueryDto } from './dto/lead-query.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { CsvBatch, CsvBatchDocument } from './schemas/csv-batch.schema';
import { Lead, LeadDocument, LeadStatus } from './schemas/lead.schema';
import { mapCsvRow } from './utils/csv-row-mapper';
import { normalizePhone } from './utils/phone-normalizer';

@Injectable()
export class LeadsService {
  constructor(
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(CsvBatch.name) private readonly batchModel: Model<CsvBatchDocument>,
    @InjectModel(CallSession.name) private readonly callSessionModel: Model<CallSession>,
  ) {}

  async uploadCsv(
    buffer: Buffer,
    fileName: string,
    categoryId: string,
    uploadedBy: string,
    columnMapping?: Record<string, string>,
  ) {
    const rows = await this.parseCsv(buffer);
    if (!rows.length) {
      throw new BadRequestException('CSV file is empty');
    }

    const batch = await this.batchModel.create({
      fileName,
      totalLeads: rows.length,
      categoryId: new Types.ObjectId(categoryId),
      uploadedBy: new Types.ObjectId(uploadedBy),
    });

    let inserted = 0;
    let duplicates = 0;
    let invalid = 0;

    try {
      const existingPhones = new Set(
        (await this.leadModel.find({ deletedAt: null }).select('phone').lean().exec()).map(
          (l) => l.phone,
        ),
      );

      const toInsert: Partial<Lead>[] = [];
      const seenInFile = new Set<string>();

      for (const row of rows) {
        const mapped = mapCsvRow(row, columnMapping);

        if (!mapped.phone && !mapped.name && !mapped.company && !mapped.email) {
          continue;
        }

        const phoneRaw = mapped.phone.split(/[;/|]/)[0].trim();
        const normalized = normalizePhone(phoneRaw);

        if (!normalized.valid) {
          invalid++;
          continue;
        }
        if (existingPhones.has(normalized.phone) || seenInFile.has(normalized.phone)) {
          duplicates++;
          continue;
        }

        seenInFile.add(normalized.phone);
        toInsert.push({
          name: mapped.name,
          phone: normalized.phone,
          email: mapped.email,
          company: mapped.company,
          category: new Types.ObjectId(categoryId),
          csvBatch: batch._id,
          timezone: mapped.timezone || normalized.timezone,
          status: LeadStatus.PENDING,
        });
      }

      if (toInsert.length) {
        try {
          const result = await this.leadModel.insertMany(toInsert, { ordered: false });
          inserted = result.length;
        } catch (err: unknown) {
          const bulkErr = err as { name?: string; insertedDocs?: unknown[]; result?: { insertedCount?: number } };
          if (bulkErr.name === 'MongoBulkWriteError') {
            inserted = bulkErr.insertedDocs?.length ?? bulkErr.result?.insertedCount ?? 0;
            duplicates += toInsert.length - inserted;
          } else {
            throw err;
          }
        }
      }

      await this.batchModel.findByIdAndUpdate(batch._id, {
        validLeads: inserted,
        duplicatesSkipped: duplicates,
      });
    } catch (err) {
      await this.batchModel.findByIdAndDelete(batch._id);
      throw err;
    }

    return { inserted, duplicates, invalid };
  }

  private parseCsv(buffer: Buffer): Promise<Record<string, string>[]> {
    return new Promise((resolve, reject) => {
      const rows: Record<string, string>[] = [];
      Readable.from(buffer)
        .pipe(csv())
        .on('data', (row: Record<string, string>) => rows.push(row))
        .on('end', () => resolve(rows))
        .on('error', reject);
    });
  }

  async findAll(query: LeadQueryDto): Promise<PaginatedResult<LeadDocument>> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const filter: Record<string, unknown> = { deletedAt: null };
    if (query.category) filter.category = new Types.ObjectId(query.category);
    if (query.status) filter.status = query.status;
    if (query.batch) filter.csvBatch = new Types.ObjectId(query.batch);

    const [data, total] = await Promise.all([
      this.leadModel
        .find(filter)
        .populate('category', 'name')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.leadModel.countDocuments(filter).exec(),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string) {
    const lead = await this.leadModel
      .findOne({ _id: id, deletedAt: null })
      .populate('category')
      .exec();
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    const callHistory = await this.callSessionModel
      .find({ leadId: lead._id })
      .sort({ startedAt: -1 })
      .exec();
    return { lead, callHistory };
  }

  async updateStatus(id: string, dto: UpdateLeadStatusDto) {
    const lead = await this.leadModel
      .findOneAndUpdate(
        { _id: id, deletedAt: null },
        { status: dto.status, ...(dto.notes ? { notes: dto.notes } : {}) },
        { new: true },
      )
      .exec();
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    return lead;
  }

  async softDelete(id: string) {
    const lead = await this.leadModel
      .findOneAndUpdate({ _id: id, deletedAt: null }, { deletedAt: new Date() }, { new: true })
      .exec();
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    return { deleted: true };
  }

  async findPendingForQueue(limit: number) {
    return this.leadModel
      .find({ status: LeadStatus.PENDING, deletedAt: null })
      .sort({ createdAt: 1 })
      .limit(limit)
      .exec();
  }

  async findBatches(limit = 10) {
    return this.batchModel
      .find()
      .populate('categoryId', 'name')
      .sort({ uploadedAt: -1 })
      .limit(limit)
      .exec();
  }

  async findCallbacksDue() {
    return this.leadModel
      .find({
        status: LeadStatus.CALLBACK,
        callbackScheduledAt: { $lte: new Date() },
        deletedAt: null,
      })
      .exec();
  }
}
