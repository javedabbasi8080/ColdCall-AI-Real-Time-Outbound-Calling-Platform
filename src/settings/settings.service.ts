import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as crypto from 'crypto';
import { Model } from 'mongoose';
import OpenAI from 'openai';
import twilio from 'twilio';
import {
  AppSettings,
  AppSettingsDocument,
  DEFAULT_SETTINGS,
  SettingsGroup,
} from './schemas/app-settings.schema';

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private readonly algorithm = 'aes-256-cbc';
  private readonly ivLength = 16;
  private cache = new Map<string, string>();

  constructor(
    @InjectModel(AppSettings.name)
    private readonly settingsModel: Model<AppSettingsDocument>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.seedDefaults();
    await this.refreshCache();
    this.logger.log(`Loaded ${this.cache.size} settings into runtime cache`);
  }

  private getEncryptionKey(): Buffer {
    const keyHex = this.configService.get<string>('settingsEncryptionKey');
    if (!keyHex || keyHex.length !== 64) {
      throw new BadRequestException(
        'SETTINGS_ENCRYPTION_KEY must be a 32-byte hex string (64 characters)',
      );
    }
    return Buffer.from(keyHex, 'hex');
  }

  encrypt(plainText: string): string {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, this.getEncryptionKey(), iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  decrypt(encryptedText: string): string {
    const [ivHex, encrypted] = encryptedText.split(':');
    if (!ivHex || !encrypted) {
      throw new BadRequestException('Invalid encrypted value format');
    }
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.getEncryptionKey(),
      iv,
    );
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  maskValue(value: string): string {
    if (!value) return '****';
    const decrypted = this.decrypt(value);
    if (decrypted.length <= 4) return '****';
    return '*'.repeat(decrypted.length - 4) + decrypted.slice(-4);
  }

  async refreshCache(): Promise<void> {
    const settings = await this.settingsModel.find().exec();
    this.cache.clear();
    for (const setting of settings) {
      try {
        this.cache.set(setting.key, this.decrypt(setting.value));
      } catch {
        this.logger.warn(`Failed to decrypt setting: ${setting.key}`);
      }
    }
  }

  async get(key: string): Promise<string | undefined> {
    if (this.cache.has(key)) {
      const cached = this.cache.get(key);
      if (cached?.trim()) return cached;
    } else {
      const setting = await this.settingsModel.findOne({ key }).exec();
      if (setting) {
        const value = this.decrypt(setting.value);
        this.cache.set(key, value);
        if (value?.trim()) return value;
      }
    }
    // Fallback: allow secrets from process.env when Settings DB value is empty
    const fromEnv = process.env[key]?.trim();
    if (fromEnv) {
      this.cache.set(key, fromEnv);
      return fromEnv;
    }
    return this.cache.get(key);
  }

  async getAll(): Promise<Record<string, string>> {
    await this.refreshCache();
    return Object.fromEntries(this.cache.entries());
  }

  async listAllMasked() {
    const settings = await this.settingsModel.find().sort({ group: 1, key: 1 }).exec();
    return settings.map((s) => ({
      key: s.key,
      label: s.label,
      group: s.group,
      maskedValue: this.maskValue(s.value),
      updatedAt: (s as AppSettingsDocument & { updatedAt?: Date }).updatedAt,
      updatedBy: s.updatedBy,
    }));
  }

  async upsert(
    key: string,
    dto: { value: string; label: string; group: SettingsGroup },
    userId: string,
  ) {
    const normalizedValue = dto.value.trim();
    const encrypted = this.encrypt(normalizedValue);
    const setting = await this.settingsModel.findOneAndUpdate(
      { key },
      {
        key,
        value: encrypted,
        label: dto.label,
        group: dto.group,
        updatedBy: userId,
      },
      { upsert: true, new: true },
    );
    this.cache.set(key, normalizedValue);
    return {
      key: setting.key,
      label: setting.label,
      group: setting.group,
      maskedValue: this.maskValue(setting.value),
    };
  }

  async delete(key: string): Promise<void> {
    await this.settingsModel.deleteOne({ key }).exec();
    this.cache.delete(key);
  }

  private async seedDefaults() {
    for (const def of DEFAULT_SETTINGS) {
      const exists = await this.settingsModel.findOne({ key: def.key }).exec();
      if (!exists && def.defaultValue) {
        await this.settingsModel.create({
          key: def.key,
          value: this.encrypt(def.defaultValue),
          label: def.label,
          group: def.group,
        });
      } else if (!exists) {
        await this.settingsModel.create({
          key: def.key,
          value: this.encrypt(''),
          label: def.label,
          group: def.group,
        });
      }
    }
  }

  async testGroup(group: SettingsGroup): Promise<{ success: boolean; message: string }> {
    switch (group) {
      case SettingsGroup.TWILIO:
        return this.testTwilio();
      case SettingsGroup.ELEVENLABS:
        return this.testElevenLabs();
      case SettingsGroup.OPENAI:
        return this.testOpenAI();
      default:
        return { success: true, message: 'System settings do not require connectivity test' };
    }
  }

  private async testTwilio(): Promise<{ success: boolean; message: string }> {
    const sid = await this.get('TWILIO_ACCOUNT_SID');
    const token = await this.get('TWILIO_AUTH_TOKEN');
    if (!sid || !token) {
      return { success: false, message: 'Twilio credentials not configured' };
    }
    try {
      const client = twilio(sid, token);
      await client.api.accounts(sid).fetch();
      return { success: true, message: 'Twilio connection successful' };
    } catch (err) {
      return { success: false, message: `Twilio test failed: ${(err as Error).message}` };
    }
  }

  private async testElevenLabs(): Promise<{ success: boolean; message: string }> {
    const apiKey = (await this.get('ELEVENLABS_API_KEY'))?.trim();
    if (!apiKey) {
      return { success: false, message: 'ElevenLabs API key not configured' };
    }

    const headers = { 'xi-api-key': apiKey };
    const voiceId = (await this.get('ELEVENLABS_VOICE_ID'))?.trim();
    const modelId =
      (await this.get('ELEVENLABS_MODEL_ID'))?.trim() || 'eleven_flash_v2_5';

    try {
      if (!voiceId) {
        const userRes = await fetch('https://api.elevenlabs.io/v1/user', { headers });
        if (userRes.ok) {
          return {
            success: true,
            message: 'ElevenLabs API key valid — save a Voice ID from My Voices (not Voice Library) to test TTS',
          };
        }
        return {
          success: false,
          message: `ElevenLabs test failed: HTTP ${userRes.status}. ${await userRes.text()}`,
        };
      }

      const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: 'ElevenLabs voice test.',
          model_id: modelId,
        }),
      });

      if (ttsRes.ok) {
        return { success: true, message: `ElevenLabs TTS working with voice ${voiceId}` };
      }

      const ttsError = await ttsRes.text();
      if (
        ttsRes.status === 402 ||
        ttsError.includes('paid_plan_required') ||
        ttsError.toLowerCase().includes('library voices')
      ) {
        return {
          success: false,
          message:
            'This Voice ID is a Voice Library voice. Free plans cannot use it via API. Open ElevenLabs → My Voices (or premade voices on your account), copy that Voice ID, save it in Settings and in the category, then test again. Or upgrade ElevenLabs.',
        };
      }

      return {
        success: false,
        message: `ElevenLabs TTS failed: HTTP ${ttsRes.status}. ${ttsError}`,
      };
    } catch (err) {
      return { success: false, message: `ElevenLabs test failed: ${(err as Error).message}` };
    }
  }

  private async testOpenAI(): Promise<{ success: boolean; message: string }> {
    const apiKey = await this.get('OPENAI_API_KEY');
    if (!apiKey) {
      return { success: false, message: 'OpenAI API key not configured' };
    }
    try {
      const client = new OpenAI({ apiKey });
      await client.models.list();
      return { success: true, message: 'OpenAI connection successful' };
    } catch (err) {
      return { success: false, message: `OpenAI test failed: ${(err as Error).message}` };
    }
  }
}
