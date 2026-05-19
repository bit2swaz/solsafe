# SolSafe

SolSafe is a conversational Solana security and intelligence agent. It pairs a Telegram bot with a minimal dashboard so users can ask plain-English questions about wallets, tokens, transactions, and program logs instead of stitching together raw explorer output by hand.

The current MVP focuses on trust-building explanations, not trade automation. Every user-facing response ends with: `Always DYOR — this is not financial advice.`

## Live MVP

- Telegram-first workflow with a minimal SIWS dashboard for linked history.
- Four live skills only: wallet summary, token security, transaction simulation, and program log explanation.
- Supabase-backed query history, rate limiting, conversation memory, and Telegram-to-wallet identity bridging.
- Phase 2 features such as whale alerts, wallet risk scoring, and natural-language swaps are intentionally hidden from the public MVP.

## Live Skills

| Skill | What it does |
| --- | --- |
| `getWalletSummary` | Summarizes SOL balance, token holdings, wallet age, and recent transaction activity. |
| `checkTokenSecurity` | Converts RugCheck output into a plain-English token safety summary. |
| `simulateTransaction` | Simulates a serialized transaction and explains likely balance changes before signing. |
| `explainProgramLogs` | Parses Solana logs and explains the result in plain English, with Groq-assisted summarization when available. |

## How To Use

### Telegram bot

Send a natural-language message to the bot. The public MVP supports wallet lookups, token checks, transaction simulations, and program log explanations.

Representative SSOT-style flow:

```text
User: @SolBot check wallet 8vFzX...
Bot:  Wallet 8vFzX... has been active for 234 days.
	Current balance: 12.4 SOL, 1,200 USDC, and 50k BONK.
	Last transaction: 2 hours ago (sent 0.1 SOL to Jupiter).
	Risk assessment: No interactions with known scam contracts. ✅
	Always DYOR — this is not financial advice.

User: what about the BONK token? is it safe?
Bot:  [Context retained] BONK (mint: DezXAZ8z7PnrnR...)
	RugCheck Score: 92/100. ✅ Verified mint, liquidity locked for 1 year.
	Top 10 holders own 18% of supply. Appears legitimate.
	Always DYOR — this is not financial advice.
```

Other live prompts:

```text
can you simulate this transaction before i sign it?
can you explain these program logs?
```

If you ask for whale alerts, wallet risk, or swaps, the public MVP will fall back to the four live skills above.

### Dashboard

Open the Next.js dashboard, sign in with Solana, and view the history linked to your wallet. Once a Telegram identity is linked to that wallet, real Telegram conversations appear in the dashboard history panel.

To link a Telegram identity for MVP testing:

```text
1. In Telegram, send /link.
2. Use the dashboard button, then complete SIWS in the dashboard.
3. Return to Telegram and send /confirm <wallet-address>.
```

## Prerequisites

- Node.js 22.20.0.
- An npm-compatible environment.
- A Telegram bot token from BotFather.
- A Telegram webhook secret that you generate yourself.
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
- `TELEGRAM_WEBHOOK_SECRET`
- `HELIUS_API_KEY`
- `GROQ_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SIWS_ORIGIN`
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

## Local Usage

### Run the Telegram bot

From the repo root:

```bash
npm run dev
```

This starts the webhook server from [src/index.ts](src/index.ts), exposes `GET /health`, validates the Telegram webhook secret, and registers the Telegram webhook defined by `WEBHOOK_URL`.

### Run the dashboard

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

## Safety Model

- SolSafe is a trust and interpretation layer, not a guarantee engine.
- The public MVP only exposes the four skills.
- Natural-language responses append the DYOR disclaimer.
- The system is designed to explain risk, not replace independent verification.

## Deployment

### Telegram bot on Render free tier

The bot deployment blueprint is defined in [render.yaml](render.yaml). Create a Render web service from this repo or apply the blueprint directly.

- Runtime: Node web service on the free plan.
- Node version: `22.20.0` via `NODE_VERSION` in the Render blueprint.
- Build command: `npm install --legacy-peer-deps --include=dev && npm run build`
- Start command: `npm run start`
- Health check: `/health`

Required Render environment variables:

- `NODE_VERSION`
- `BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `WEBHOOK_URL`
- `HELIUS_API_KEY`
- `GROQ_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SIWS_ORIGIN`

### Dashboard on Vercel free tier

The dashboard deployment config is defined in [dashboard/vercel.json](dashboard/vercel.json). Import the repo into Vercel and set the project root directory to `dashboard`.

- Install command: `npm install`
- Build command: `npm run build`

Required Vercel environment variables:

- `NEXT_PUBLIC_SOLANA_RPC_URL`
- `SIWS_ORIGIN`
- `SIWS_DOMAIN`
- `SIWS_SESSION_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## License

This repository is licensed under the terms in [LICENSE](LICENSE).