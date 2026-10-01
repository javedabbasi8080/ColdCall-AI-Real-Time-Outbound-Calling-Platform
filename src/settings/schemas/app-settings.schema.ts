import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum SettingsGroup {
  TWILIO = 'twilio',
  ELEVENLABS = 'elevenlabs',
  OPENAI = 'openai',
  SYSTEM = 'system',
}

export type AppSettingsDocument = HydratedDocument<AppSettings>;

@Schema({ timestamps: { createdAt: false, updatedAt: true } })
export class AppSettings {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ required: true })
  value: string;

  @Prop({ required: true })
  label: string;

  @Prop({ required: true, enum: SettingsGroup })
  group: SettingsGroup;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;
}

export const AppSettingsSchema = SchemaFactory.createForClass(AppSettings);

export const DEFAULT_SETTINGS: Array<{
  key: string;
  label: string;
  group: SettingsGroup;
  defaultValue?: string;
}> = [
  { key: 'TWILIO_ACCOUNT_SID', label: 'Twilio Account SID', group: SettingsGroup.TWILIO },
  { key: 'TWILIO_AUTH_TOKEN', label: 'Twilio Auth Token', group: SettingsGroup.TWILIO },
  { key: 'TWILIO_FROM_NUMBER', label: 'Twilio From Number', group: SettingsGroup.TWILIO },
  { key: 'TWILIO_WEBHOOK_BASE_URL', label: 'Twilio Webhook Base URL', group: SettingsGroup.TWILIO },
  {
    key: 'TWILIO_SPEECH_LANGUAGE',
    label: 'Twilio Speech Language (e.g. en-IN, en-US, ur-PK)',
    group: SettingsGroup.TWILIO,
    defaultValue: 'en-IN',
  },
  { key: 'ELEVENLABS_API_KEY', label: 'ElevenLabs API Key', group: SettingsGroup.ELEVENLABS },
  { key: 'ELEVENLABS_VOICE_ID', label: 'ElevenLabs Voice ID', group: SettingsGroup.ELEVENLABS },
  { key: 'ELEVENLABS_MODEL_ID', label: 'ElevenLabs Model ID', group: SettingsGroup.ELEVENLABS },
  { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', group: SettingsGroup.OPENAI },
  { key: 'OPENAI_MODEL', label: 'OpenAI Model (gpt-4o-mini recommended for calls)', group: SettingsGroup.OPENAI, defaultValue: 'gpt-4o-mini' },
  { key: 'MAX_CONCURRENT_CALLS', label: 'Max Concurrent Calls', group: SettingsGroup.SYSTEM, defaultValue: '5' },
  { key: 'CALL_HOURS_START', label: 'Call Hours Start (HH:mm)', group: SettingsGroup.SYSTEM, defaultValue: '09:00' },
  { key: 'CALL_HOURS_END', label: 'Call Hours End (HH:mm)', group: SettingsGroup.SYSTEM, defaultValue: '17:00' },
  { key: 'COST_TWILIO_PER_MINUTE_USD', label: 'Twilio Cost per Minute (USD)', group: SettingsGroup.SYSTEM, defaultValue: '0.014' },
  { key: 'COST_ELEVENLABS_PER_1K_CHARS_USD', label: 'ElevenLabs Cost per 1K Chars (USD)', group: SettingsGroup.SYSTEM, defaultValue: '0.18' },
  { key: 'COST_OPENAI_INPUT_PER_1M_TOKENS_USD', label: 'OpenAI Input Cost per 1M Tokens (USD)', group: SettingsGroup.SYSTEM, defaultValue: '2.5' },
  { key: 'COST_OPENAI_OUTPUT_PER_1M_TOKENS_USD', label: 'OpenAI Output Cost per 1M Tokens (USD)', group: SettingsGroup.SYSTEM, defaultValue: '10' },
  {
    key: 'CALL_TTS_MODE',
    label: 'Call TTS Mode (elevenlabs = Pakistani Urdu accent, twilio = fast but English/Indian accent)',
    group: SettingsGroup.SYSTEM,
    defaultValue: 'elevenlabs',
  },
  {
    key: 'INBOUND_DEFAULT_CATEGORY',
    label: 'Inbound Default Category Name (exact match, e.g. Real estate)',
    group: SettingsGroup.SYSTEM,
    defaultValue: 'Real estate',
  },
  {
    key: 'CALL_VOICE_MODE',
    label: 'Voice Mode (media_stream = OpenAI STT + GPT + ElevenLabs; gather = legacy debug)',
    group: SettingsGroup.SYSTEM,
    defaultValue: 'media_stream',
  },
  {
    key: 'TWILIO_SAY_VOICE',
    label: 'Twilio Say Voice (legacy gather fallback)',
    group: SettingsGroup.TWILIO,
    defaultValue: 'Google.en-IN-Standard-B',
  },
  {
    key: 'TWILIO_SAY_RATE',
    label: 'Twilio Say Speed (SSML rate, e.g. 115% or 120%)',
    group: SettingsGroup.TWILIO,
    defaultValue: '115%',
  },
  { key: 'JWT_SECRET', label: 'JWT Secret', group: SettingsGroup.SYSTEM },
];
