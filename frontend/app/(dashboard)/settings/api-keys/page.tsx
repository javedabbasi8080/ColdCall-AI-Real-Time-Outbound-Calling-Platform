'use client';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PageHeader } from '@/components/layout/PageHeader';
import { ApiKeyGuide } from '@/components/settings/ApiKeyGuide';
import { ApiKeyRow } from '@/components/settings/ApiKeyRow';
import { TestConnectionButton } from '@/components/settings/TestConnectionButton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSettings } from '@/hooks/useSettings';
import type { SettingsGroup } from '@/types';

const groups: {
  key: SettingsGroup;
  title: string;
  description: string;
  keys: string[];
  guide: { summary: string; links: { label: string; url: string }[] };
  keyHelp: Record<string, { url: string; label: string }>;
}[] = [
  {
    key: 'twilio',
    title: 'Twilio',
    description: 'Outbound calling and webhook configuration',
    keys: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'TWILIO_WEBHOOK_BASE_URL', 'TWILIO_SPEECH_LANGUAGE'],
    guide: {
      summary: 'Twilio powers outbound phone calls. Create a free trial account, then grab your credentials from the console.',
      links: [
        { label: 'Sign up / Free trial', url: 'https://www.twilio.com/try-twilio' },
        { label: 'Twilio Console (dashboard)', url: 'https://console.twilio.com/' },
        { label: 'Buy a phone number', url: 'https://console.twilio.com/us1/develop/phone-numbers/manage/search' },
        { label: 'Voice webhook docs', url: 'https://www.twilio.com/docs/voice/tutorials/how-to-respond-to-incoming-phone-calls' },
      ],
    },
    keyHelp: {
      TWILIO_ACCOUNT_SID: { label: 'Find in Console', url: 'https://console.twilio.com/' },
      TWILIO_AUTH_TOKEN: { label: 'Find in Console', url: 'https://console.twilio.com/' },
      TWILIO_FROM_NUMBER: { label: 'Buy a number', url: 'https://console.twilio.com/us1/develop/phone-numbers/manage/search' },
      TWILIO_WEBHOOK_BASE_URL: { label: 'Use ngrok (local dev)', url: 'https://ngrok.com/' },
      TWILIO_SPEECH_LANGUAGE: {
        label: 'Speech locales (en-IN recommended for Pakistan/Urdu roman)',
        url: 'https://www.twilio.com/docs/voice/twiml/gather#languagethespeech',
      },
    },
  },
  {
    key: 'elevenlabs',
    title: 'ElevenLabs',
    description: 'AI voice synthesis for outbound calls',
    keys: ['ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'ELEVENLABS_MODEL_ID'],
    guide: {
      summary:
        'ElevenLabs converts your call script into speech. Free plan: use a My Voices / premade voice (not Voice Library) and model eleven_flash_v2_5.',
      links: [
        { label: 'Sign up (Free)', url: 'https://elevenlabs.io/sign-up' },
        { label: 'API keys', url: 'https://elevenlabs.io/app/settings/api-keys' },
        { label: 'My Voices (use these IDs)', url: 'https://elevenlabs.io/app/voice-lab' },
        { label: 'Models docs', url: 'https://elevenlabs.io/docs/models' },
      ],
    },
    keyHelp: {
      ELEVENLABS_API_KEY: { label: 'Create API key', url: 'https://elevenlabs.io/app/settings/api-keys' },
      ELEVENLABS_VOICE_ID: { label: 'My Voices (not Voice Library)', url: 'https://elevenlabs.io/app/voice-lab' },
      ELEVENLABS_MODEL_ID: {
        label: 'Use eleven_flash_v2_5 on Free',
        url: 'https://elevenlabs.io/docs/models',
      },
    },
  },
  {
    key: 'openai',
    title: 'OpenAI',
    description: 'GPT intent detection and script engine',
    keys: ['OPENAI_API_KEY', 'OPENAI_MODEL'],
    guide: {
      summary: 'OpenAI powers intent detection during calls. Add billing, then generate an API key from the platform dashboard.',
      links: [
        { label: 'Sign up', url: 'https://platform.openai.com/signup' },
        { label: 'API keys', url: 'https://platform.openai.com/api-keys' },
        { label: 'Pricing & billing', url: 'https://openai.com/api/pricing/' },
        { label: 'Model overview', url: 'https://platform.openai.com/docs/models' },
      ],
    },
    keyHelp: {
      OPENAI_API_KEY: { label: 'Create API key', url: 'https://platform.openai.com/api-keys' },
      OPENAI_MODEL: { label: 'Choose a model', url: 'https://platform.openai.com/docs/models' },
    },
  },
];

export default function ApiKeysPage() {
  const { data: settings, isLoading } = useSettings();

  return (
    <ErrorBoundary>
      <PageHeader title="API Keys" description="Manage third-party credentials (values encrypted at rest)" />

      <div className="space-y-6">
        {groups.map((group) => {
          const groupSettings = settings?.filter((s) => group.keys.includes(s.key)) || [];
          return (
            <Card key={group.key}>
              <CardHeader>
                <CardTitle>{group.title}</CardTitle>
                <CardDescription>{group.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <ApiKeyGuide summary={group.guide.summary} links={group.guide.links} />
                {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
                {groupSettings.map((setting) => {
                  const help = group.keyHelp[setting.key];
                  return (
                    <ApiKeyRow
                      key={setting.key}
                      setting={setting}
                      helpUrl={help?.url}
                      helpLabel={help?.label}
                    />
                  );
                })}
                <div className="pt-4">
                  <TestConnectionButton group={group.key} label={`Test ${group.title}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ErrorBoundary>
  );
}
