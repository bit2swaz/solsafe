# PROJECT: Solana Security & Intelligence Agent (Free-Tier MVP)

## Overview
We are building a conversational AI agent for Telegram that provides real-time, human-readable security analysis and on-chain intelligence for the Solana ecosystem. It moves beyond static block explorers by leveraging the new Solana Agent Skills toolkit and LangChain.js orchestration to create an agentic workflow. Users can ask natural language questions about wallets, tokens, and transactions, and receive actionable, trust-building summaries.

## Core Value Proposition
- **Shift from Intent-Based to Agentic:** Users don't navigate complex UIs; they simply ask the agent.
- **Trust Layer:** The agent interprets and explains on-chain risk, acting as a "Norton Antivirus" for Solana interactions.
- **Open-Source & Extensible:** Built on the newly released Solana Agent Skills, allowing other developers to add custom skills easily.

## Technical Architecture

### 1. Frontend / User Interface
- **Primary Interface:** Telegram Bot (using grammY + Telegram Bot API).
- **Web Dashboard (Minimal):** Simple Next.js app using shadcn/ui to show query history and wallet health summary. Authentication via Sign-In With Solana (SIWS).

### 2. Backend & Orchestration (The "Brain")
- **Runtime:** Node.js server deployed on Render.com (free Hobby tier).
- **Agent Framework:** **LangChain.js** for:
  - Routing user intents ("wallet lookup" vs "token security check" vs "transaction simulation").
  - Managing conversation memory (BufferMemory).
  - Tool calling (integrating Solana Agent Skills).
- **Solana Interaction Layer:**
  - **Solana Agent Kit** (Solana Foundation) – 60+ pre-built actions.
  - **Solana Agent Skills** – custom skills we create (e.g. `checkRugScore`, `analyzeWalletAge`).
- **Data Providers (all free tiers):**
  - **Helius RPC** (1M credits/month, 10 RPS).
  - **RugCheck.xyz API** (free tier).
  - **Birdeye / Jupiter API** for price data.

### 3. Memory & Storage
- **Database:** Supabase (free tier PostgreSQL) for:
  - User query history.
  - Cached security scores (to stay under Helius/RugCheck limits).
  - Agent conversation memory.

### 4. Key Agent Skills (Implementation Plan)

#### Phase 1: Core Skills (MVP)
| Skill Name              | Description                                              | Tools Used                     |
|-------------------------|----------------------------------------------------------|--------------------------------|
| `getWalletSummary`      | SOL balance, token holdings, wallet age, recent tx count | Solana Agent Kit + Helius      |
| `checkTokenSecurity`    | Human-readable RugCheck score + warnings                 | RugCheck API                   |
| `simulateTransaction`   | Simulate tx and explain balance changes in plain English | Solana Agent Kit               |
| `explainProgramLogs`    | Parse logs → simple English explanation                  | Custom parser + Groq LLM       |

#### Phase 2: Post-MVP (after shipping)
| Skill Name          | Description |
|---------------------|-------------|
| `getWhaleAlerts`    | Monitor large movements via Helius Webhooks |
| `assessWalletRisk`  | Score wallet based on age, patterns, malicious contracts |
| `naturalLanguageSwap` | “swap 0.1 SOL for USDC” → Jupiter (with user confirmation) |

### 5. Conversation Flow Example
```
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

## MVP Build Plan

### Foundation
1. Set up Telegram bot via BotFather + grammY.
2. Create Node.js/Express backend.
3. Integrate Solana Agent Kit and test basic `getBalance`.
4. Add simple LangChain router + BufferMemory.
5. Deploy bot to Render.com free tier (webhook).

### Security + Polish + Ship
1. Integrate RugCheck.xyz API + `checkTokenSecurity` skill.
2. Build `getWalletSummary` with Helius + caching in Supabase.
3. Add `simulateTransaction` + simple log parser.
4. Connect Groq (Llama 3.1 8B free tier) for natural-language explanations.
5. Build minimal Next.js dashboard on Vercel + SIWS.
6. Add query logging + rate-limit safeguards.
7. Write README + record 2-minute demo video.
8. Open-source the repo + custom skills.

## Key Differentiators from Existing Projects
- **Conversational Interface:** Natural language, not commands or dashboards.
- **Extensible Skill Framework:** Built on official Solana Agent Skills.
- **Focus on Trust and Explanation:** Plain-English summaries that actually help non-technical users.

## Long-Term Vision
- B2B security bot for DAOs (scan links, flag scams).
- Browser “Vibe Check” extension before signing txs.
- Decentralized reputation layer (stake-to-vouch).
