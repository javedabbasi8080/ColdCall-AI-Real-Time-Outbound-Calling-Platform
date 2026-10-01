import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { SettingsService } from '../settings/settings.service';
import { shapePakistaniSpeech } from './realtime/pk-urdu-speak';
import { prepareTtsText } from './realtime/pk-phone-tts';

@Injectable()
export class ElevenLabsService {
  private readonly logger = new Logger(ElevenLabsService.name);
  private redis: Redis;
  private readonly audioStore = new Map<string, Buffer>();
  private totalCharactersSynthesized = 0;
  private usableVoiceIdCache: string | null = null;

  constructor(
    private readonly settingsService: SettingsService,
    private readonly configService: ConfigService,
  ) {
    const redisUrl = this.configService.get<string>('redisUrl') || 'redis://127.0.0.1:6379';
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    this.redis.on('error', (err) => {
      this.logger.warn(`Redis unavailable for TTS cache: ${err.message}`);
    });
  }

  getTotalCharactersSynthesized(): number {
    return this.totalCharactersSynthesized;
  }

  private readonly memCache = new Map<string, Buffer>();

  private cacheKey(text: string, voiceId: string, modelId: string): string {
    const hash = crypto
      .createHash('sha256')
      .update(`${text}:${voiceId}:${modelId}:spd1.12`)
      .digest('hex');
    return `elevenlabs:audio:${hash}`;
  }

  private isLibraryVoiceBlocked(status: number, errText: string): boolean {
    if (status !== 402 && status !== 401 && status !== 403) return false;
    const lower = errText.toLowerCase();
    return (
      lower.includes('paid_plan_required') ||
      lower.includes('library voices') ||
      lower.includes('payment_required')
    );
  }

  /** Pick a voice the free plan can synthesize (premade/cloned), not Voice Library. */
  private async resolveUsableVoiceId(apiKey: string): Promise<string | null> {
    if (this.usableVoiceIdCache) return this.usableVoiceIdCache;

    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey },
    });
    if (!res.ok) {
      this.logger.error(`Failed to list ElevenLabs voices: ${res.status} ${await res.text()}`);
      return null;
    }

    const data = (await res.json()) as {
      voices?: Array<{ voice_id: string; name: string; category?: string }>;
    };
    const voices = data.voices || [];
    const preferOrder = ['cloned', 'generated', 'professional', 'premade'];
    for (const category of preferOrder) {
      const match = voices.find((v) => (v.category || '').toLowerCase() === category);
      if (match) {
        this.usableVoiceIdCache = match.voice_id;
        this.logger.warn(
          `Using ElevenLabs fallback voice "${match.name}" (${match.voice_id}, category=${match.category}). Update category/settings Voice ID to a non-library voice.`,
        );
        return match.voice_id;
      }
    }

    const first = voices[0];
    if (first) {
      this.usableVoiceIdCache = first.voice_id;
      this.logger.warn(`Using first available ElevenLabs voice "${first.name}" (${first.voice_id})`);
      return first.voice_id;
    }
    return null;
  }

  private async requestTts(
    apiKey: string,
    voiceId: string,
    modelId: string,
    text: string,
    stability: number,
    similarityBoost: number,
    speed = 1.05,
    languageCode?: string,
  ): Promise<{ ok: true; buffer: Buffer } | { ok: false; status: number; errText: string }> {
    const started = Date.now();
    // optimize_streaming_latency=4 = fastest; ~1.05 = clear Karachi call pace
    const url =
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}` +
      `?optimize_streaming_latency=4&output_format=mp3_22050_32`;
    const body: Record<string, unknown> = {
      text,
      model_id: modelId,
      voice_settings: {
        stability,
        similarity_boost: similarityBoost,
      },
      speed: Math.min(1.08, Math.max(0.9, speed)),
      // Helps English voices pronounce mixed names more consistently
      apply_text_normalization: 'auto',
    };
    // Force Urdu pronunciation (Pakistani accent path) — ISO 639-1 / 639-3 when supported
    // Note: flash/turbo often reject 'ur'/'urd'; omit and rely on Urdu-script text instead.
    if (languageCode && !/^ur/i.test(languageCode)) {
      body.language_code = languageCode;
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { ok: false, status: response.status, errText };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    this.logger.log(
      `PERF tts=${Date.now() - started}ms chars=${text.length} voice=${voiceId} speed=${speed} lang=${languageCode || 'auto'}`,
    );
    return { ok: true, buffer };
  }

  /**
   * Preload greeting as Twilio Media Stream µ-law frames (20ms / 160 bytes each).
   * Used so the first audio can play immediately when the stream connects.
   */
  async synthesizeUlawFrames(
    text: string,
    voiceOverrides?: {
      voiceId?: string;
      stability?: number;
      similarityBoost?: number;
      modelId?: string;
    },
  ): Promise<string[]> {
    text = prepareTtsText(text);
    if (!text) return [];

    const apiKey = (await this.settingsService.get('ELEVENLABS_API_KEY'))?.trim();
    const voiceId =
      voiceOverrides?.voiceId?.trim() ||
      (await this.settingsService.get('ELEVENLABS_VOICE_ID'))?.trim();
    const modelId =
      voiceOverrides?.modelId ||
      (await this.settingsService.get('ELEVENLABS_MODEL_ID')) ||
      'eleven_flash_v2_5';
    if (!apiKey || !voiceId) {
      throw new Error('ElevenLabs API key or voice ID not configured');
    }

    const cacheKey = this.cacheKey(`${text}|ulaw8k`, voiceId, modelId);
    const mem = this.memCache.get(cacheKey);
    let buffer: Buffer;
    if (mem) {
      buffer = mem;
    } else {
      const started = Date.now();
      const url =
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}` +
        `?optimize_streaming_latency=4&output_format=ulaw_8000`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/octet-stream',
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability: voiceOverrides?.stability ?? 0.35,
            similarity_boost: voiceOverrides?.similarityBoost ?? 0.8,
          },
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ElevenLabs ulaw failed: ${response.status} ${errText}`);
      }
      buffer = Buffer.from(await response.arrayBuffer());
      this.totalCharactersSynthesized += text.length;
      this.memCache.set(cacheKey, buffer);
      this.logger.log(
        `PERF tts_ulaw_preload=${Date.now() - started}ms chars=${text.length} bytes=${buffer.length}`,
      );
    }

    // Twilio Media Streams: 20ms @ 8kHz µ-law = 160 bytes per frame
    const FRAME = 160;
    const frames: string[] = [];
    for (let i = 0; i < buffer.length; i += FRAME) {
      frames.push(buffer.subarray(i, Math.min(i + FRAME, buffer.length)).toString('base64'));
    }
    return frames;
  }

  async synthesize(
    text: string,
    voiceOverrides?: {
      voiceId?: string;
      stability?: number;
      similarityBoost?: number;
      modelId?: string;
      languageCode?: string;
      /** When true, keep phonetic Roman (best for English premade voices like Sarah). */
      skipUrduScript?: boolean;
    },
  ): Promise<Buffer> {
    // Roman Urdu only
    text = prepareTtsText(text);
    const apiKey = (await this.settingsService.get('ELEVENLABS_API_KEY'))?.trim();
    let voiceId =
      voiceOverrides?.voiceId?.trim() ||
      (await this.settingsService.get('ELEVENLABS_VOICE_ID'))?.trim();
    // Flash handles real-time + mixed Roman Urdu/English better than multilingual_v2 for phone
    const modelId =
      voiceOverrides?.modelId ||
      (await this.settingsService.get('ELEVENLABS_MODEL_ID')) ||
      'eleven_flash_v2_5';
    const languageCode =
      voiceOverrides?.languageCode && !/^ur|auto$/i.test(voiceOverrides.languageCode)
        ? voiceOverrides.languageCode
        : undefined;

    if (!apiKey || !voiceId) {
      throw new Error('ElevenLabs API key or voice ID not configured');
    }

    const stability = voiceOverrides?.stability ?? 0.35;
    const similarityBoost = voiceOverrides?.similarityBoost ?? 0.8;

    const trySynthesize = async (id: string): Promise<Buffer> => {
      const key = this.cacheKey(`${text}|roman-pk`, id, modelId);
      const mem = this.memCache.get(key);
      if (mem) {
        this.logger.log(`PERF tts=0ms cache=memory chars=${text.length}`);
        return mem;
      }
      try {
        const cached = await this.redis.getBuffer(key);
        if (cached) {
          this.memCache.set(key, cached);
          this.logger.log(`PERF tts=0ms cache=redis chars=${text.length}`);
          return cached;
        }
      } catch (err) {
        this.logger.warn(
          `Redis cache read failed (continuing without cache): ${(err as Error).message}`,
        );
      }

      this.logger.log(
        `Synthesizing TTS (${text.length} chars) voice=${id} model=${modelId} mode=roman-urdu`,
      );
      const result = await this.requestTts(
        apiKey,
        id,
        modelId,
        text,
        stability,
        similarityBoost,
        1.0,
        languageCode,
      );
      if (!result.ok) {
        throw Object.assign(new Error(`ElevenLabs synthesis failed: ${result.status} ${result.errText}`), {
          status: result.status,
          errText: result.errText,
        });
      }

      this.totalCharactersSynthesized += text.length;
      this.memCache.set(key, result.buffer);
      try {
        await this.redis.setex(key, 3600, result.buffer);
      } catch (err) {
        this.logger.warn(`Redis cache write failed: ${(err as Error).message}`);
      }
      return result.buffer;
    };

    try {
      return await trySynthesize(voiceId);
    } catch (err) {
      const status = (err as { status?: number }).status || 0;
      const errText = (err as { errText?: string }).errText || (err as Error).message;
      if (!this.isLibraryVoiceBlocked(status, errText)) {
        this.logger.error((err as Error).message);
        throw err;
      }

      this.logger.error(
        `Voice ${voiceId} blocked for this plan (library/paid). Finding a usable voice...`,
      );
      const fallbackId = await this.resolveUsableVoiceId(apiKey);
      if (!fallbackId || fallbackId === voiceId) {
        throw err;
      }
      return trySynthesize(fallbackId);
    }
  }

  async streamToTwilio(
    text: string,
    callSid: string,
    step: number,
    voiceOverrides?: {
      voiceId?: string;
      stability?: number;
      similarityBoost?: number;
      languageCode?: string;
      skipUrduScript?: boolean;
    },
  ): Promise<string> {
    const audio = await this.synthesize(text, voiceOverrides);
    const audioId = `${callSid}-${step}-${crypto.randomBytes(4).toString('hex')}`;
    this.audioStore.set(audioId, audio);
    setTimeout(() => this.audioStore.delete(audioId), 3600000);

    const baseUrl = await this.settingsService.get('TWILIO_WEBHOOK_BASE_URL');
    if (!baseUrl) {
      throw new Error('TWILIO_WEBHOOK_BASE_URL not configured');
    }
    return `${baseUrl.replace(/\/$/, '')}/calls/serve-audio/${audioId}`;
  }

  getAudioBuffer(audioId: string): Buffer | undefined {
    return this.audioStore.get(audioId);
  }
}
