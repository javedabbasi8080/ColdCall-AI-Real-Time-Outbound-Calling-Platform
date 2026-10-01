import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CallSession, CallSessionSchema } from '../calls/schemas/call-session.schema';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { CsvBatch, CsvBatchSchema } from './schemas/csv-batch.schema';
import { Lead, LeadSchema } from './schemas/lead.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: CsvBatch.name, schema: CsvBatchSchema },
      { name: CallSession.name, schema: CallSessionSchema },
    ]),
  ],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
