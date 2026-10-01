# ColdCall AI — Real-Time Outbound Calling Platform

Outbound cold calling for sales teams. Upload leads, dial from the portal, and let a voice agent talk in Roman Urdu or English — listen, remember context, answer questions, and guide toward a site visit or follow-up.

**Built by:** [Javed Abbasi](https://github.com/javedabbasi8080)  
**Stack:** NestJS · Next.js · Twilio Media Streams · OpenAI · ElevenLabs

---

## Screenshots

| Dashboard | Live Calls | Voice Lab |
|-----------|------------|-----------|
| _(add screenshot)_ | _(add screenshot)_ | _(add screenshot)_ |

---

## What It Does

| Feature | Details |
|---------|---------|
| **Outbound calls** | Start calls from the portal; Twilio connects audio via Media Streams |
| **Voice agent** | GPT-driven consultant (not a rigid IVR script) |
| **Speech pipeline** | OpenAI realtime STT → conversation brain → ElevenLabs TTS |
| **Memory & stages** | Remembers purpose, budget, interest; soft sales stages |
| **Answer-first** | Questions and objections handled before pitching |
| **Knowledge base** | Per-category products, FAQs, payment plans, voice settings |
| **Lead CRM** | CSV upload, status tracking, call history + transcripts |
| **Analytics** | Overview metrics, conversion, cost estimates |
| **Voice Lab** | Test ElevenLabs voices without touching live calls |
| **Encrypted settings** | API keys stored encrypted in MongoDB |

---

## Architecture (How a Call Works)

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────────┐
│  Next.js    │────▶│  NestJS API  │────▶│  Twilio Voice Call  │
│  Portal     │     │  + Bull/Redis│     │  + Media Streams WS │
└─────────────┘     └──────┬───────┘     └──────────┬──────────┘
                           │                        │
                           │         ┌──────────────▼──────────┐
                           │         │  Realtime Call Session  │
                           │         │  1. OpenAI STT (speech) │
                           │         │  2. Conversation Agent  │
                           │         │  3. ElevenLabs TTS WS   │
                           │         └──────────────┬──────────┘
                           │                        │
              ┌────────────▼────────┐    ┌──────────▼──────────┐
              │ MongoDB (leads, KB, │    │ Audio µ-law frames  │
              │ calls, settings)    │    │ back to Twilio      │
              └─────────────────────┘    └─────────────────────┘
```

1. Operator uploads leads / starts a call from the portal.
2. NestJS places the call with Twilio and opens a **Media Streams** WebSocket.
3. Caller audio → **OpenAI** speech-to-text (normalized Roman Urdu).
4. Conversation agent uses memory + stage + business knowledge (optional live web search).
5. Reply streams into **ElevenLabs** TTS → µ-law audio → Twilio → caller hears it.
6. Call ends → transcript, outcome, and usage/cost are saved.

---

## Tech Stack

### Backend
- **NestJS** + TypeScript
- **MongoDB** (Mongoose)
- **Redis** + **Bull** (call queue / concurrency)
- **Twilio** Voice + Media Streams
- **OpenAI** (realtime STT + GPT + optional web search)
- **ElevenLabs** (streaming TTS + Voice Lab REST)
- JWT auth (Passport), AES-encrypted settings

### Frontend
- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** + shadcn/ui
- **TanStack Query** + Zustand
- Recharts, react-dropzone, dnd-kit

---

## Prerequisites

| Tool | Notes |
|------|--------|
| Node.js 20+ | Backend + frontend |
| MongoDB | Local or Atlas |
| Redis | Local (`redis://127.0.0.1:6379`) |
| Twilio account | Voice-capable number |
| OpenAI API key | STT + LLM |
| ElevenLabs API key | Voice ID from **My Voices** (not Voice Library on free plans) |
| ngrok (or similar) | Public HTTPS URL for Twilio webhooks + Media Streams |

---

## Project Structure

```
cold-calling/
├── src/                      # NestJS API
│   ├── auth/                 # Login, JWT, default admin seed
│   ├── calls/                # Twilio, realtime session, ElevenLabs WS TTS
│   ├── knowledge/            # Conversation agent, memory, stages, KB
│   ├── leads/                # CSV upload + lead CRUD
│   ├── categories/           # Campaign / script categories
│   ├── settings/             # Encrypted API keys & system config
│   ├── analytics/            # Metrics & cost estimates
│   ├── queue/                # Bull call queue
│   └── voice-lab/            # Isolated ElevenLabs voice tester API
├── frontend/                 # Next.js portal (port 3001)
├── .env.example              # Backend env template
└── README.md
```

---

## Quick Start (Install)

### 1. Clone & install

```bash
git clone https://github.com/javedabbasi8080/ColdCall-AI-Real-Time-Outbound-Calling-Platform.git
cd ColdCall-AI-Real-Time-Outbound-Calling-Platform

# Backend
npm install

# Frontend
cd frontend
npm install
cd ..
```

### 2. Backend environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
MONGODB_URI=mongodb://localhost:27017/cold-calling
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=dev-jwt-secret-change-in-production
SETTINGS_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
PORT=3000
LIVE_WEB_SEARCH=true
```

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `REDIS_URL` | Yes | Redis for Bull queue + TTS cache |
| `JWT_SECRET` | Yes | Must match frontend `JWT_SECRET` |
| `SETTINGS_ENCRYPTION_KEY` | Yes | **64 hex chars** (32 bytes) — encrypts API keys in DB |
| `PORT` | No | Default `3000` |
| `LIVE_WEB_SEARCH` | No | `true` / `false` — live web search during calls |

Twilio, OpenAI, and ElevenLabs keys are **not** required in `.env`.  
Set them after login under **Settings → API Keys** (stored encrypted).

Generate a fresh encryption key if needed:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Frontend environment

```bash
cp frontend/.env.local.example frontend/.env.local
```

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
JWT_SECRET=dev-jwt-secret-change-in-production
```

`JWT_SECRET` **must match** the backend value.

### 4. Run

**Terminal 1 — API:**

```bash
npm run start:dev
# → http://localhost:3000
# → Media Streams WS: /calls/media-stream
```

**Terminal 2 — Portal:**

```bash
cd frontend
npm run dev
# → http://localhost:3001
```

### 5. Login

On first boot the API seeds an admin user:

| Field | Value |
|-------|--------|
| Email | `admin@coldcalling.local` |
| Password | `admin123` |

Change this password before any real deployment.

---

## Connect Providers (Portal Config)

After login, open **Settings → API Keys** and save:

| Key | Purpose |
|-----|---------|
| `TWILIO_ACCOUNT_SID` | Twilio account |
| `TWILIO_AUTH_TOKEN` | Twilio auth |
| `TWILIO_FROM_NUMBER` | Caller ID (E.164, e.g. `+1...`) |
| `TWILIO_WEBHOOK_BASE_URL` | Public HTTPS base (ngrok URL, no trailing slash) |
| `OPENAI_API_KEY` | STT + GPT |
| `OPENAI_MODEL` | e.g. `gpt-4o-mini` |
| `ELEVENLABS_API_KEY` | TTS |
| `ELEVENLABS_VOICE_ID` | Voice from My Voices / premade |
| `ELEVENLABS_MODEL_ID` | e.g. `eleven_flash_v2_5` |

**System settings** (optional): max concurrent calls, calling hours, cost rates for usage estimates.

Use **Test Connection** on each provider group to verify credentials.

---

## Making a Real Call (Twilio + ngrok)

1. Start ngrok pointing at the API:

   ```bash
   ngrok http 3000
   ```

2. Copy the `https://....ngrok-free.app` URL into Settings as `TWILIO_WEBHOOK_BASE_URL`.

3. In Twilio Console, ensure your number can make outbound voice calls.

4. In the portal:
   - Create / select a **Category** (knowledge, products, voice defaults)
   - **Upload leads** (CSV) or add leads for that category
   - Open a lead → **Start call**, or use Live Calls

5. Watch the call on **Live Calls**; after hangup, open **Call History** for transcript and outcome.

Media Streams attach to the same Nest HTTP server at:

```text
wss://<your-ngrok-host>/calls/media-stream
```

---

## Portal Pages

| Route | Description |
|-------|-------------|
| `/dashboard` | Metrics, charts, recent activity |
| `/calls/live` | In-progress calls (polling) |
| `/calls/history` | History + transcript drawer |
| `/leads` | Lead table, filters, status |
| `/leads/upload` | CSV upload + column mapping |
| `/categories` | Category / knowledge / voice editor |
| `/analytics` | Overview & by-category analytics |
| `/voice-lab` | Test ElevenLabs voices (isolated module) |
| `/settings/api-keys` | Encrypted provider keys |
| `/settings/system` | Call engine & cost rates |

---

## Voice Lab

Separate Nest module (`src/voice-lab`) + portal page to try ElevenLabs voices without using the live call pipeline.

- List account voices & models  
- Tune stability / similarity / style / speed  
- Generate MP3 → play / download  

API (JWT required):

```http
GET  /voice-lab/voices
GET  /voice-lab/models
POST /voice-lab/synthesize
```

---

## Conversation Brain

The agent is not a fixed FAQ robot:

| Piece | What it does |
|-------|----------------|
| **Memory** | Purpose (living / investment), property type, budget, appointment intent |
| **Stages** | greeting → permission → rapport → purpose → qualification → product → appointment / objection / close |
| **Answer-first** | Questions and objections answered before the pitch advances |
| **Roman Urdu STT** | Maps Urdu/Hindi script + common mishears into Latin text |
| **Knowledge** | DB facts woven into natural speech, not read as a list |

---

## API Overview

Base URL: `http://localhost:3000`

| Area | Examples |
|------|----------|
| Auth | `POST /auth/login`, `GET /auth/me` |
| Settings | `GET /settings`, `PUT /settings/:key`, `POST /settings/test/:group` |
| Categories | `GET/POST /categories` |
| Knowledge | `/knowledge/categories/:id/bundle`, products, FAQs, stages |
| Leads | `GET /leads`, `POST /leads/upload` |
| Calls | `GET /calls`, `POST /calls/start/:leadId` |
| Analytics | `/analytics/overview`, `/analytics/by-category` |
| Voice Lab | `/voice-lab/*` |

Protected routes expect:

```http
Authorization: Bearer <accessToken>
```

---

## Security Notes

- Never commit `.env`, `.env.local`, or real API keys
- `SETTINGS_ENCRYPTION_KEY` and `JWT_SECRET` must be strong in production
- Change the default admin password immediately
- Twilio webhooks should only be reachable over HTTPS (ngrok / reverse proxy)
- Free ElevenLabs plans often cannot use Voice Library IDs via API — use **My Voices** / premade

---

## Scripts

**Backend (repo root)**

```bash
npm run start:dev    # watch mode
npm run build
npm run start:prod
npm run lint
npm test
```

**Frontend (`frontend/`)**

```bash
npm run dev          # port 3001
npm run build
npm run start
```

---

## Roadmap

- [ ] Multi-tenant workspaces  
- [ ] Inbound call handling polish  
- [ ] WhatsApp follow-up after call  
- [ ] A/B voice comparison in Voice Lab  
- [ ] Docker Compose (API + Mongo + Redis + frontend)

---

## License

Private / UNLICENSED unless otherwise stated by the author.

---

## Author

**Javed Abbasi** ([@javedabbasi8080](https://github.com/javedabbasi8080))

Full-stack engineer. NestJS API, realtime voice pipelines, and a consultative sales agent (Roman Urdu / English) for live outbound calling workflows.
