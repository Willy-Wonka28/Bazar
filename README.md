# Bazar — Agentic Wallet Runtime

> **Bazar is currently available on Solana Devnet only.**

A zero-trust security layer for autonomous AI agents on the Solana blockchain. The runtime separates agent decision-making from wallet execution, enforcing strict policies before any transaction is ever signed.

### What's Inside

**`bazar-backend`** — Secure middleware that sits between agents and the database.
- Holds all Supabase credentials server-side — agents never touch the database directly.
- Provides API endpoints for agent registration, encrypted key retrieval, and policy lookup.
- Acts as the single gateway for all sensitive operations (key generation, agent provisioning).

**`agentic-wallet-sdk`** — TypeScript SDK that agents import to interact with the blockchain.
- Validates every transaction intent against the agent's assigned policy (amount caps, rate limits etc.) before signing.
- Decrypts the agent's private key in-memory for signing only — it is never persisted to disk or logs.
- Broadcasts transactions to Solana Devnet with automatic Alchemy RPC failover.
- Includes an interactive CLI (`npx bazar init`) for zero-friction agent onboarding.
- **Integrates with Jupiter v6 DEX** — agents can execute real on-chain swaps, with Jupiter's program ID enforced by the policy engine.

---

The AI Agent decides *what* to do. The `agentic-wallet-sdk` intercepts the intent, validates it against immutable policies stored in a central Supabase registry, and only signs if the request passes every constraint (`max_tx_amount`, `allowed_programs`, `max_tx_per_minute`). If the agent goes rogue, the SDK throws a `Policy Violation` before a transaction is ever constructed.

---

## Project Structure

```
bazar/
├── agentic-wallet-sdk/    Core security runtime (npm package)
├── bazar-backend/         Secure middleware
├── agents-demo/           Demo AI agent scripts
│   ├── trader-agent/      Jupiter DEX swap agent (SOL → USDC)
│   └── treasury-agent/    Secured vault payout agent
└── admin-dashboard/       Next.js Command Center
```

### bazar-backend
A lightweight Express server that is the **only** component with database write access.
- Holds the `service_role` key server-side — agents never see it.
- `POST /api/register` — generates keypair, encrypts private key, creates agent record.
- `GET /api/agent/:id` — returns an agent's encrypted key (only their own).
- `GET /api/agent/:id/policy` — returns an agent's policy rules.
- `GET /api/policies` — lists available role templates.
- **Policy sync**: On every registration, the backend upserts policy rules from `POLICY_TEMPLATES` — changes to program whitelists or limits propagate automatically without manual database edits.

### agentic-wallet-sdk
- **Policy Engine**: Validates intents using Zod. Unregistered agents get a restrictive default policy (Standard Trader limits (1.5 SOL, 5 tx/min), System Program only).
- **Wallet Manager**: Fetches encrypted keys from the backend, decrypts in memory, signs, and erases. Never touches Supabase directly.
- **Execution Engine**: Broadcasts to Devnet with automatic Alchemy RPC fallback.
- **Jupiter Swap Module** (`jupiterSwap.ts`): Fetches quotes and swap transactions from the Jupiter v6 Aggregator API. Program IDs in the returned `VersionedTransaction` are extracted and validated against the agent's policy before signing.
- **Interactive CLI** (`npx bazar init`): Agents self-register by choosing a role. Everything is routed through the backend.

### agents-demo
- **trader-agent**: Uses the Jupiter v6 API to swap **0.01 SOL → USDC** on Devnet. The agent fetches a quote, validates all program IDs in the returned transaction against its `DeFi Trader` policy, signs, and broadcasts. This is a real DeFi interaction with a live protocol.
- **treasury-agent**: Simulates a secured vault paying out **0.1 SOL to the Trader wallet**.

Both agents **self-register on first boot**: if `AGENT_ID` is empty in `.env`, the agent calls `POST /api/register`, receives its credentials, writes them to `.env`, and proceeds — fully autonomous, zero human intervention.

### admin-dashboard
A monochromatic Next.js Command Center. Click "Launch Sequence" to spawn agent processes and watch the SDK validate or reject intents in real-time via Server-Sent Events.

---

## Jupiter Integration

The Trader Agent performs a real swap on the Jupiter v6 Aggregator on Devnet.

| Detail | Value |
|---|---|
| Jupiter API | `https://quote-api.jup.ag/v6` |
| Input Token | Wrapped SOL — `So11111111111111111111111111111111111111112` |
| Output Token | Devnet USDC — `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| Swap Amount | 0.01 SOL per run |
| Slippage | 0.5% (50 bps, configurable) |

**How the policy enforces it:**
The `DeFi Trader` policy's `allowed_programs` whitelist includes Jupiter's program ID. When the trader agent calls `executeJupiterSwap()`, the SDK extracts every program ID referenced in Jupiter's returned `VersionedTransaction` and runs them through `PolicyEngine.validateInstructions()`. If any program is not whitelisted, the transaction is rejected before it is ever signed.

```
DeFi Trader — allowed_programs:
  11111111111111111111111111111111               → System Program
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4  → Jupiter v6 Aggregator
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA  → SPL Token Program
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bRS → Associated Token Account Program
```

---

## Zero-Trust Security Architecture

### 1. Complete Agent Isolation
Each agent has its own unique encryption secret, Solana keypair, and policy assignment. Compromising one agent has **zero impact** on any other agent.

### 2. Zero Database Exposure
Agents have **no Supabase credentials whatsoever** — not even the anon key. All data access is mediated through the Bazar Backend, which is the sole holder of the `service_role` key.

### 3. Agents Cannot See Each Other
Row Level Security blocks all public `SELECT` on the agents table. An agent cannot query another agent's wallet address, encrypted key, or policy assignment. This is enforced at the database level.

### 4. Per-Agent AES-256-GCM Encryption
Private keys are encrypted with a unique 32-character hex secret generated per agent. Even if the database is compromised, keys are useless without each agent's individual secret.

### 5. In-Memory Signing
Raw private keys are decrypted into RAM only for the millisecond needed to sign a transaction, then immediately discarded. They never persist in memory, disk, or logs.

### 6. Default Policy Fallback
If an agent's policy is missing or corrupted, the SDK applies a hardcoded Standard Trader fallback: 1.5 SOL cap, 5 tx/min, System Program only.

### 7. Dual RPC Failover
If the primary Solana Devnet RPC fails, the SDK automatically retries via an Alchemy endpoint, ensuring transactions aren't lost.

### 8. Registration Rate Limiting
The `/api/register` endpoint is rate-limited to **2 registrations per IP address every 8 hours**, preventing spam and database abuse. The backend trusts Railway's `X-Forwarded-For` header to resolve real client IPs behind the proxy.

### 9. Automatic Policy Sync
On every agent registration, the backend upserts the policy rules from the hardcoded `POLICY_TEMPLATES` source of truth. Stale database entries (e.g., missing Jupiter's program ID) are self-healed without manual intervention.

---

## Test Results

All core SDK modules were verified with **16 unit tests** (all passing):

| Module | Tests | Status |
|---|---|---|
| SecureKeyStore | Encrypt/Decrypt round-trip, wrong secret rejection, tamper detection, unique ciphertexts | PASS |
| PolicyEngine | Policy parsing, transfer validation, program whitelisting, DEFAULT_POLICY enforcement | PASS |

---

## Judge's Setup Guide

### Step 0: Clone
```bash
git clone https://github.com/your-username/bazar.git
cd bazar
```

### Step 1: Backend (Already Live)
The Bazar Backend is deployed at **https://bazar-backend.up.railway.app** — no local setup required.

### Step 2: Build the SDK
```bash
cd agentic-wallet-sdk
npm install
npm run build
```

### Step 3: Install Agent Dependencies
```bash
cd agents-demo/trader-agent && npm install
cd ../treasury-agent && npm install
```

### Step 4: Fund the Trader Wallet
The Trader Agent needs SOL to pay for the Jupiter swap. On first boot it will print its wallet address. Fund it:
```bash
solana airdrop 2 <TRADER_WALLET_ADDRESS> --url devnet
```

### Step 5: Launch the Command Center
```bash
cd admin-dashboard
npm install && npm run dev
```

Open `http://localhost:3000`, click **Launch Sequence** on the Trader Agent tile, and watch it fetch a Jupiter quote, validate the policy, and broadcast a real on-chain swap.

---

## Key Environment Variables

### Agent .env (no database credentials!)
| Variable | Purpose |
|---|---|
| `AGENT_ID` | UUID from `npx bazar init` |
| `RPC_URL` | Primary Solana Devnet endpoint |
| `RPC_URL_FALLBACK` | Alchemy Devnet RPC (automatic failover) |
| `BAZAR_BACKEND_URL` | Backend API URL (default: `https://bazar-backend.up.railway.app`) |
| `ENCRYPTION_SECRET` | Per-agent AES-256-GCM passphrase |

### Backend .env (the only place secrets live)
| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Central Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Full-access admin key (server-side only) |
| `PORT` | Server port (default: 4000) |

---

## Bounty Requirements Checklist

| Requirement | Status |
|---|---|
| Wallet created programmatically (`Keypair.generate()` at registration, no human input) | ✅ |
| Transactions signed automatically (in-memory keypair, zero manual steps) | ✅ |
| Holds SOL and SPL tokens (USDC received post-swap lives in the agent's ATA) | ✅ |
| Interacts with a real test protocol (Jupiter v6 DEX swap on Devnet) | ✅ |
| Open-source with clear README and setup instructions | ✅ |
| Working prototype on Devnet | ✅ |
| `SKILLS.md` file included for agents to read | ✅ |
| Secure key management (AES-256-GCM per-agent encryption, in-memory only) | ✅ |
| Automated transaction signing without manual input | ✅ |
| AI agent decision simulation (trade logic lives entirely in agent scripts) | ✅ |
| Clear separation of agent logic vs. wallet operations | ✅ |
| Multiple independent agents supported (Trader + Treasury, fully isolated) | ✅ |
