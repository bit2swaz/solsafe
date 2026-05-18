# SolSafe

SolSafe is a conversational Solana security and intelligence agent. It pairs a Telegram bot with a minimal dashboard so users can ask plain-English questions about wallets, tokens, transactions, and program logs instead of stitching together raw explorer output by hand.

The current MVP focuses on trust-building explanations, not trade automation. Every user-facing response is designed to end with an explicit DYOR reminder.

## What It Does

- Runs a Telegram bot on Node.js with grammY and a webhook-friendly HTTP server.
- Routes user intents through a SolSafe agent boundary backed by LangChain-style abstractions.
- Explains wallet state, token risk, transaction simulations, and program logs in plain English.
- Stores query history, cache state, conversation memory, and rate-limit state in Supabase.
- Ships a separate Next.js dashboard with SIWS authentication, query history views, and wallet-health UI.
- Includes post-MVP skill stubs for whale alerts, wallet risk scoring, and natural-language swaps.

## Architecture

- Primary interface: Telegram bot via grammY.
- Dashboard: Next.js app in [dashboard](dashboard).
- Runtime: Node.js 20+.
- Agent orchestration: LangChain packages plus a custom SolSafe agent boundary.
- Solana integrations: Solana Agent Kit with Helius RPC.
- Token/security data: RugCheck and parser-first log analysis with optional Groq summarization.
- Persistence: Supabase for history, cache, conversation memory, and rate limiting.
- Deployment targets: Render for the bot and Vercel for the dashboard.

## Current Skill Set

### MVP Skills

| Skill | Status | Purpose |
| --- | --- | --- |
| `getWalletSummary` | Implemented | Summarizes SOL balance, token holdings, wallet age, and recent transaction activity. |
| `checkTokenSecurity` | Implemented | Converts RugCheck output into a human-readable token safety summary. |
| `simulateTransaction` | Implemented | Simulates a serialized transaction and explains likely balance changes before signing. |
| `explainProgramLogs` | Implemented | Parses Solana logs and explains the result in plain English, with Groq-assisted summarization when available. |

### Post-MVP Extensibility Stubs

| Skill | Status | Current Behavior |
| --- | --- | --- |
| `getWhaleAlerts` | Stub | Plans a future Helius enhanced-webhook flow for large-transfer monitoring. |
| `assessWalletRisk` | Stub | Defines the future wallet-risk scoring surface and risk-factor model. |
| `naturalLanguageSwap` | Stub | Previews a Jupiter-backed swap flow and stops at an explicit confirmation boundary. |

## Repository Layout

```text
.
├── dashboard/               # Next.js dashboard app with SIWS
├── docs/                    # SSOT and roadmap
├── src/
│   ├── agents/              # Agent registry, routing, turn execution
│   ├── lib/                 # Supabase, Helius, Groq, memory, rate limiting
│   ├── skills/              # SolSafe skills
│   └── telegram/            # Telegram bot and webhook server
├── supabase/                # SQL migrations
└── tests/                   # Unit and end-to-end coverage
```

## Prerequisites

- Node.js 20 or newer.
- An npm-compatible environment.
- A Telegram bot token from BotFather.
- A Helius API key.
- A Supabase project URL and service-role key.
- A Groq API key if you want LLM-assisted program-log summaries.

## Local Setup

### 1. Install root dependencies

The LangChain stack currently needs legacy peer-dependency resolution in this repo.

```bash
npm install --legacy-peer-deps
```

### 2. Configure the bot environment

Copy [.env.example](.env.example) into `.env` and set:

- `BOT_TOKEN`
- `HELIUS_API_KEY`
- `GROQ_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WEBHOOK_URL`

### 3. Install dashboard dependencies

```bash
cd dashboard
npm install
```

### 4. Configure the dashboard environment

Copy [dashboard/.env.example](dashboard/.env.example) into `dashboard/.env.local` and set:

- `NEXT_PUBLIC_SOLANA_RPC_URL`
- `SIWS_ORIGIN`
- `SIWS_DOMAIN`
- `SIWS_SESSION_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Usage

### Run the Telegram bot locally

From the repo root:

```bash
npm run dev
```

This starts the webhook server from [src/index.ts](src/index.ts), exposes `GET /health`, and registers the Telegram webhook defined by `WEBHOOK_URL`.

### Run the dashboard locally

From [dashboard](./dashboard):

```bash
npm run dev
```

### Build the projects

Root bot build:

```bash
npm run build
```

Dashboard build:

```bash
cd dashboard
npm run build
```

### Run the tests

Root tests:

```bash
npx vitest run
```

Dashboard tests:

```bash
cd dashboard
npm test
```

## Example Prompts

The conversational shape is grounded in [docs/SSOT.md](docs/SSOT.md):

```text
@SolBot check wallet 8vFzX...
what about the BONK token? is it safe?
can you simulate this transaction before i sign it?
can you explain these program logs?
monitor whale alerts for <wallet>
assess wallet risk for <wallet>
swap 0.1 SOL for USDC
```

## Safety Model

- SolSafe is a trust and interpretation layer, not a guarantee engine.
- Transaction previews and natural-language swaps stop before silent execution.
- Natural-language responses append a DYOR disclaimer.
- The system is designed to explain risk, not replace independent verification.

## Deployment

### Bot on Render

The bot deployment blueprint is defined in [render.yaml](render.yaml).

- Runtime: native Node service.
- Build command: `npm install --legacy-peer-deps && npm run build`
- Start command: `npm run start`
- Health check: `/health`

### Dashboard on Vercel

The dashboard deployment config is defined in [dashboard/vercel.json](dashboard/vercel.json).

- Install command: `npm install`
- Build command: `npm run build`
- App root: `dashboard/`

## License

This repository is licensed under the terms in [LICENSE](LICENSE).