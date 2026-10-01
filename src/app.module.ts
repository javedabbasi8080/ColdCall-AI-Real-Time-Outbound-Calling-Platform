import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { CallsModule } from './calls/calls.module';
import { CategoriesModule } from './categories/categories.module';
import configuration from './config/configuration';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { LeadsModule } from './leads/leads.module';
import { QueueModule } from './queue/queue.module';
import { SettingsModule } from './settings/settings.module';
import { VoiceLabModule } from './voice-lab/voice-lab.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('mongodbUri'),
      }),
    }),
    SettingsModule,
    KnowledgeModule,
    AuthModule,
    CategoriesModule,
    LeadsModule,
    CallsModule,
    QueueModule,
    AnalyticsModule,
    VoiceLabModule,
  ],
})
export class AppModule {}
