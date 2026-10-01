# Cold Calling Frontend

Next.js 14 dashboard for the Cold Calling System API.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- TanStack Query + Zustand
- React Hook Form + Zod
- Recharts, react-dropzone, dnd-kit

## Setup

```bash
cd frontend
npm install
cp .env.local.example .env.local   # or edit .env.local
npm run dev
```

Frontend runs on **http://localhost:3001**  
Backend API: **http://localhost:3000** (set via `NEXT_PUBLIC_API_URL`)

Ensure `JWT_SECRET` in `.env.local` matches the backend `.env` value so middleware can verify tokens.

## Default Login

- Email: `admin@coldcalling.local`
- Password: `admin123`

## Pages

| Route | Description |
|-------|-------------|
| `/dashboard` | Metrics, charts, recent calls |
| `/calls/live` | Live calls (3s polling) |
| `/calls/history` | Paginated call history + transcript drawer |
| `/leads` | Lead table with filters & bulk actions |
| `/leads/upload` | CSV upload with column mapping |
| `/categories` | Script editor + voice settings |
| `/analytics` | Overview, by-category, funnel tabs |
| `/settings/api-keys` | Encrypted API key management |
| `/settings/system` | Call engine settings |

## Auth Flow

1. `POST /api/auth/login` → sets httpOnly `auth_token` cookie
2. `middleware.ts` verifies JWT on all protected routes
3. Client fetches token via `/api/auth/token` for API Authorization header
