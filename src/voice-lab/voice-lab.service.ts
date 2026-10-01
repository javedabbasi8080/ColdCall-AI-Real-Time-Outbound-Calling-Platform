import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

export type VoiceLabVoice = {
  voiceId: string;
  name: string;
  category?: string;
  previewUrl?: string;
  labels?: Record<string, string>;
};

export type VoiceLabModel = {
  modelId: string;
  name: string;
  languages?: string[];
};

export type SynthesizeInput = {
  text: string;
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speed?: number;
  useSpeakerBoost?: boolean;
};

/**
 * Isolated ElevenLabs voice tester.
 * Talks to the ElevenLabs REST API directly using the saved API key.
 * Does NOT touch the live call pipeline (ElevenLabsService / realtime WS).
 */
@Injectable()
export class VoiceLabService {
  private readonly logger = new Logger(VoiceLabService.name);
  private readonly base = 'https://api.elevenlabs.io/v1';

  constructor(private readonly settings: SettingsService) {}

  private async apiKey(): Promise<string> {
    const key = (await this.settings.get('ELEVENLABS_API_KEY'))?.trim();
    if (!key) {
      throw new BadRequestException(
        'ElevenLabs API key not configured. Add it in Settings → API Keys.',
      );
    }
    return key;
  }

  async listVoices(): Promise<VoiceLabVoice[]> {
    const key = await this.apiKey();
    const res = await fetch(`${this.base}/voices`, {
      headers: { 'xi-api-key': key },
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new BadRequestException(
        `Failed to load voices: HTTP ${res.status} ${errText.slice(0, 200)}`,
      );
    }
    const data = (await res.json()) as {
      voices?: Array<{
        voice_id: string;
        name: string;
        category?: string;
        preview_url?: string;
        labels?: Record<string, string>;
      }>;
    };
    return (data.voices || []).map((v) => ({
      voiceId: v.voice_id,
      name: v.name,
      category: v.category,
      previewUrl: v.preview_url,
      labels: v.labels,
    }));
  }

  async listModels(): Promise<VoiceLabModel[]> {
    const key = await this.apiKey();
    try {
      const res = await fetch(`${this.base}/models`, {
        headers: { 'xi-api-key': key },
      });
      if (res.ok) {
        const data = (await res.json()) as Array<{
          model_id: string;
          name?: string;
          languages?: Array<{ name?: string; language_id?: string }>;
        }>;
        const models = data
          .filter((m) => /tts|flash|turbo|multilingual|monolingual|v\d/i.test(m.model_id))
          .map((m) => ({
            modelId: m.model_id,
            name: m.name || m.model_id,
            languages: (m.languages || [])
              .map((l) => l.name || l.language_id || '')
              .filter(Boolean),
          }));
        if (models.length) return models;
      } else {
        this.logger.warn(`Model list HTTP ${res.status}; using defaults`);
      }
    } catch (err) {
      this.logger.warn(`Model list failed: ${(err as Error).message}; using defaults`);
    }
    // Fallback common TTS models
    return [
      { modelId: 'eleven_flash_v2_5', name: 'Flash v2.5 (fast, phone)' },
      { modelId: 'eleven_turbo_v2_5', name: 'Turbo v2.5' },
      { modelId: 'eleven_multilingual_v2', name: 'Multilingual v2 (quality)' },
    ];
  }

  /** Returns MP3 audio bytes for the given text/voice/settings. */
  async synthesize(input: SynthesizeInput): Promise<Buffer> {
    const text = (input.text || '').trim();
    if (!text) throw new BadRequestException('Text is required');
    if (text.length > 2000) {
      throw new BadRequestException('Text too long (max 2000 chars for the tester)');
    }

    const key = await this.apiKey();
    const voiceId =
      input.voiceId?.trim() ||
      (await this.settings.get('ELEVENLABS_VOICE_ID'))?.trim();
    if (!voiceId) {
      throw new BadRequestException(
        'No Voice ID selected and none saved in Settings.',
      );
    }
    const modelId =
      input.modelId?.trim() ||
      (await this.settings.get('ELEVENLABS_MODEL_ID'))?.trim() ||
      'eleven_flash_v2_5';

    const voiceSettings: Record<string, unknown> = {
      stability: this.clamp(input.stability, 0, 1, 0.5),
      similarity_boost: this.clamp(input.similarityBoost, 0, 1, 0.75),
    };
    if (typeof input.style === 'number') {
      voiceSettings.style = this.clamp(input.style, 0, 1, 0);
    }
    if (typeof input.useSpeakerBoost === 'boolean') {
      voiceSettings.use_speaker_boost = input.useSpeakerBoost;
    }

    const body: Record<string, unknown> = {
      text,
      model_id: modelId,
      voice_settings: voiceSettings,
      apply_text_normalization: 'auto',
    };
    if (typeof input.speed === 'number') {
      body.speed = this.clamp(input.speed, 0.7, 1.2, 1.0);
    }

    const started = Date.now();
    const res = await fetch(
      `${this.base}/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': key,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      if (
        res.status === 402 ||
        errText.includes('paid_plan_required') ||
        errText.toLowerCase().includes('library voices')
      ) {
        throw new BadRequestException(
          'This Voice ID is a Voice Library voice — free plans cannot use it via API. Pick a voice from "My Voices" / premade, or upgrade ElevenLabs.',
        );
      }
      throw new BadRequestException(
        `TTS failed: HTTP ${res.status} ${errText.slice(0, 200)}`,
      );
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    this.logger.log(
      `VOICE_LAB tts=${Date.now() - started}ms chars=${text.length} voice=${voiceId} model=${modelId} bytes=${buffer.length}`,
    );
    return buffer;
  }

  private clamp(v: number | undefined, min: number, max: number, dflt: number): number {
    if (typeof v !== 'number' || Number.isNaN(v)) return dflt;
    return Math.min(max, Math.max(min, v));
  }
}
