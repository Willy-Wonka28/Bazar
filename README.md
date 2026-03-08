# Bazar — Agentic Wallet Runtime

> **The Treasury Agent runs on Solana Devnet. The Trader Agent runs on Solana Mainnet** (Jupiter's aggregator API has no devnet equivalent — [see why](#jupiter-integration)).

Bazar is a zero-trust security layer for autonomous AI agents on Solana. The core idea: an AI agent should be able to decide *what* to do on-chain, but never have unilateral authority to *actually do it*. Every transaction intent passes through an immutable policy engine before a single byte is signed.

Two agents ship with the repo — a **Trader** that swaps SOL → USDC on Jupiter v6 Mainnet, and a **Treasury Vault** that pays out controlled micro-amounts on Devnet. Both self-register on first boot, generate their own wallets, and operate fully autonomously.

---

## Project Structure

```
bazar/
├── agentic-wallet-sdk/    Core security runtime (npm package)
│   └── src/
│       ├── walletClient.ts      Main agent interface — policy → sign → broadcast
│       ├── policyEngine.ts      Zod-validated rule enforcement
│       ├── secureKeyStore.ts    AES-256-GCM encrypt/decrypt
│       ├── walletManager.ts     In-memory key loading via backend
│       ├── jupiterSwap.ts       Jupiter v6 quote, swap tx, program ID extraction
│       ├── transactionBuilder.ts  SOL transfer instruction builder
│       ├── observability.ts     Structured JSON logging
│       └── cli.ts               npx bazar init onboarding CLI
├── bazar-backend/         Secure middleware (the only Supabase holder)
│   └── server.ts          Registration, policy sync, encrypted key retrieval
├── agents-demo/
│   ├── trader-agent/      Jupiter DEX swap agent — SOL → USDC, Mainnet
│   └── treasury-agent/    Secured vault payout agent — Devnet
└── admin-dashboard/       Next.js Command Center with live SSE terminal
```

---

## How It All Fits Together

Here's the full flow when a judge clicks "Launch Sequence" on the Trader Agent:

```
Admin Dashboard
  └─ GET /api/execute?agent=trader-agent
       └─ spawns: ts-node agents-demo/trader-agent/index.ts

trader-agent/index.ts
  └─ wallet.executeJupiterSwap(SOL, USDC, 10_000_000)
       │
       ├─ 1. resolvePolicy()
       │     └─ GET bazar-backend/api/agent/:id/policy
       │           └─ returns DeFi Trader rules from Supabase
       │
       ├─ 2. getJupiterQuote()        [jupiterSwap.ts]
       │     └─ GET lite-api.jup.ag/swap/v1/quote
       │
       ├─ 3. loadDecryptedWallet()    [walletManager.ts]
       │     └─ GET bazar-backend/api/agent/:id
       │           └─ encrypted key fetched → AES-256-GCM decrypted in RAM
       │
       ├─ 4. getJupiterSwapTransaction()  [jupiterSwap.ts]
       │     └─ POST lite-api.jup.ag/swap/v1/swap
       │           └─ returns VersionedTransaction (base64)
       │
       ├─ 5. extractProgramIds() + validateInstructions()
       │     └─ every program in Jupiter's tx checked against allowed_programs
       │     └─ any unlisted program → throws "Policy Violation" immediately
       │
       └─ 6. swapTx.sign([signerKeypair]) → broadcastWithFallback()
             └─ primary RPC → Alchemy mainnet fallback if needed
```

Everything in steps 1–5 happens *before* any signing. The agent script has no direct access to keys, no Supabase credentials, and no ability to bypass the policy check.

---

## Bounty Requirements — Line by Line

This is exactly where each requirement is satisfied in the codebase.

---

### ✅ Wallet created programmatically — no human input

> `bazar-backend/server.ts` line 250

```ts
const keypair = Keypair.generate();
```

When an agent calls `POST /api/register`, the backend generates a fresh Solana keypair using `Keypair.generate()` from `@solana/web3.js`. No seed phrase, no manual key import, zero human involvement. The wallet address is derived from the public key and returned to the agent.

---

### ✅ Transactions signed automatically — zero manual steps

> `agentic-wallet-sdk/src/walletClient.ts` lines 136, 233

For legacy transactions (SOL transfer):
```ts
transaction.sign(signerKeypair);
```

For Jupiter's VersionedTransaction (DEX swap):
```ts
swapTx.sign([signerKeypair]);
```

The keypair is loaded, decrypted, and used to sign in a single uninterrupted flow. No prompts, no confirmations, no human in the loop.

---

### ✅ Holds SOL and SPL tokens

The Trader Agent's wallet holds:
- **SOL** — needed as the swap input and to pay transaction fees
- **USDC** — received after each successful Jupiter swap, held in the agent's Associated Token Account (ATA), which Jupiter creates automatically on first swap

The Treasury Agent's wallet holds SOL on Devnet, used for controlled payouts.

---

### ✅ Interacts with a real protocol — Jupiter v6 DEX on Mainnet

> `agentic-wallet-sdk/src/jupiterSwap.ts` and `agentic-wallet-sdk/src/walletClient.ts` lines 187–252

This is the core DeFi interaction. The agent calls `executeJupiterSwap()` which:

1. Hits `https://lite-api.jup.ag/swap/v1/quote` to find the best route across all mainnet liquidity pools
2. Hits `https://lite-api.jup.ag/swap/v1/swap` to get a fully-formed `VersionedTransaction`
3. Deserializes the base64 transaction with `VersionedTransaction.deserialize()`
4. Validates it (see policy check below)
5. Signs and broadcasts to Solana Mainnet

This is a real, live on-chain swap — not a simulation. The output USDC lands in the agent's wallet and is verifiable on Solana Explorer.

> **Note on Mainnet:** Jupiter's aggregator (`lite-api.jup.ag`) only routes against mainnet liquidity pools. There is no devnet version of Jupiter routing infrastructure. The Trader Agent is intentionally wired to mainnet so the full DeFi flow works end-to-end. The security properties are network-agnostic.

---

### ✅ Policy engine validates every program before signing

> `agentic-wallet-sdk/src/policyEngine.ts` lines 66–80
> `agentic-wallet-sdk/src/walletClient.ts` lines 220–228
> `agentic-wallet-sdk/src/jupiterSwap.ts` lines 96–108

This is the crux of the security model. Jupiter's `VersionedTransaction` can reference many programs internally (routers, liquidity pools, token programs). Before signing, the SDK extracts every single program ID from the transaction's compiled instructions:

```ts
// jupiterSwap.ts — extractProgramIds()
for (const ix of tx.message.compiledInstructions) {
    const programId = staticAccountKeys[ix.programIdIndex];
    programIds.add(programId.toBase58());
}
```

Then each ID is checked against the agent's `allowed_programs` whitelist:

```ts
// policyEngine.ts — validateInstructions()
for (const ix of instructions) {
    if (!allowedSet.has(ix.programId.toBase58())) {
        throw new Error(`Policy Violation: Agent is not allowed to interact with program ${programId}`);
    }
}
```

The **DeFi Trader** policy whitelists exactly four programs:

| Program | Address |
|---|---|
| System Program | `11111111111111111111111111111111` |
| Jupiter v6 Aggregator | `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` |
| SPL Token Program | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` |
| Associated Token Account | `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bRS` |

Anything outside that list — any rogue program, any injected instruction — throws a `Policy Violation` before signing. This check cannot be bypassed by the agent script.

---

### ✅ Secure key management — AES-256-GCM, per-agent, in-memory only

> `agentic-wallet-sdk/src/secureKeyStore.ts`
> `agentic-wallet-sdk/src/walletManager.ts` line 40
> `bazar-backend/server.ts` lines 19–30

Private keys are encrypted at registration time using AES-256-GCM with a per-agent 32-byte key derived from a randomly generated `encryptionSecret`:

```ts
// server.ts — encryptPrivateKey()
const masterKey = crypto.createHash('sha256').update(secret).digest();
const iv = crypto.randomBytes(16);  // fresh IV per encryption
const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
// stored as: iv:authTag:encryptedData
```

At signing time, `walletManager.ts` fetches the ciphertext from the backend and decrypts it in RAM:

```ts
const decryptedHex = this.keystore.decrypt(data.encrypted_private_key);
const secretKey = Uint8Array.from(Buffer.from(decryptedHex, 'hex'));
return Keypair.fromSecretKey(secretKey);  // exists in memory only
```

The plaintext key is never written to disk, never logged, and never returned from any function. It lives in RAM for exactly as long as the signing operation takes.

---

### ✅ AI agent decision simulation — trade logic lives in agent scripts

> `agents-demo/trader-agent/index.ts` lines 83–92
> `agents-demo/treasury-agent/index.ts`

The agent scripts contain the "AI brain" — the decision about what to do. The SDK only handles *how* to do it safely. In `trader-agent/index.ts`:

```ts
// The AI decides: swap 0.01 SOL → USDC via Jupiter
console.log('AI Decision: Swapping 0.01 SOL → USDC via Jupiter DEX.');
const signature = await wallet.executeJupiterSwap(
    DEVNET_MINTS.SOL,
    DEVNET_MINTS.USDC,
    SWAP_AMOUNT_LAMPORTS
);
```

The agent could have decided to send SOL, interact with a different protocol, or do nothing — the SDK doesn't care. It only enforces *whether* that decision is permitted by policy.

---

### ✅ Clear separation of agent logic vs. wallet operations

The architecture enforces this structurally:

- **Agent scripts** (`agents-demo/`) — make decisions, call SDK methods
- **`agentic-wallet-sdk`** — validates, signs, broadcasts. Knows nothing about trade strategy
- **`bazar-backend`** — holds keys and policies. Knows nothing about what agents are doing
- **Supabase** — stores encrypted data. Agents never touch it directly

An agent cannot sign a transaction by itself. It has no keypair, no Supabase credentials, and no way to call `sendRawTransaction` directly. Everything flows through the SDK's policy gate.

---

### ✅ Multiple independent agents — fully isolated

Two agents ship with completely separate identities:

| | Trader Agent | Treasury Agent |
|---|---|---|
| Role | `trader` (DeFi Trader policy) | `treasury` (Treasury Vault policy) |
| Network | Mainnet | Devnet |
| Max TX | 1.5 SOL | 0.1 SOL |
| TX/min | 5 | 1 |
| Allowed programs | System + Jupiter + SPL Token + ATA | System Program only |
| UUID | Unique per registration | Unique per registration |
| Encryption secret | Unique random 32-byte hex | Unique random 32-byte hex |

Compromising one agent's `ENCRYPTION_SECRET` gives zero access to the other. They have different wallets, different policies, and different encryption keys. The isolation is enforced at every layer — SDK, backend, and database (Row Level Security blocks cross-agent reads).

---

### ✅ `SKILLS.md` file for agent consumption

> `agentic-wallet-sdk/SKILLS.md`

Documents all SDK capabilities in a format designed to be read by an AI agent: method signatures, example code, available mints, required policy programs. This is the interface contract between the AI decision layer and the wallet execution layer.

---

### ✅ Open-source, self-contained, fully deployable

Backend is live at **https://bazar-backend.up.railway.app** — judges don't need to run it. The agents work out of the box by cloning the repo, installing dependencies, and running `npm start`.

---

## Zero-Trust Security Architecture

### 1. Complete Agent Isolation
Each agent gets a unique Solana keypair, a unique `ENCRYPTION_SECRET`, and its own policy assignment. One compromised agent doesn't touch any other.

### 2. Zero Database Exposure
Agents have no Supabase credentials — not even the anon key. Every data access goes through the Bazar Backend, which is the sole holder of the `service_role` key (`server.ts` lines 11–14).

### 3. Agents Cannot See Each Other
Supabase Row Level Security blocks all public `SELECT` on the `agents` table. An agent cannot query another agent's wallet, key, or policy — enforced at the DB level, not in application code.

### 4. Per-Agent AES-256-GCM Encryption
Every agent gets a fresh random `encryptionSecret` at registration (`server.ts` line 247: `crypto.randomBytes(16).toString('hex')`). Even with full Supabase access, the ciphertext is useless without each agent's individual secret.

### 5. In-Memory Signing Only
Keys are decrypted into a local variable in `walletManager.ts`, used for signing, and immediately go out of scope. Never assigned to a class field, never logged, never persisted.

### 6. Default Policy Fallback
If an agent's policy is missing or corrupted, the SDK applies a hardcoded `DEFAULT_POLICY` (`policyEngine.ts` lines 26–30): 1.5 SOL cap, 5 tx/min, System Program only. Agents can never operate without constraints.

### 7. Dual RPC Failover
`walletClient.ts` lines 85–112: if the primary RPC throws, the SDK retries via the Alchemy endpoint automatically. No transaction is lost to a flaky RPC.

### 8. Registration Rate Limiting
`server.ts` lines 72–100: `/api/register` is limited to 2 registrations per IP per 8 hours. Prevents DB spam.

### 9. Automatic Policy Sync
`server.ts` lines 219–230: on every registration, the backend upserts policy rules from the hardcoded `POLICY_TEMPLATES`. Stale entries in Supabase get overwritten — the code is always the source of truth.

---

## Jupiter Integration

> `agentic-wallet-sdk/src/jupiterSwap.ts`

| Detail | Value |
|---|---|
| Jupiter API | `https://lite-api.jup.ag/swap/v1` |
| Network | Solana Mainnet |
| Input | Wrapped SOL — `So11111111111111111111111111111111111111112` |
| Output | USDC — `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Swap Amount | 0.01 SOL per run |
| Slippage | 0.5% (50 bps, configurable) |

> **Why Mainnet?** Jupiter's aggregator (`lite-api.jup.ag`) only routes against mainnet liquidity pools. There is no devnet deployment of Jupiter routing infrastructure. The Trader Agent is intentionally wired to mainnet so the full DeFi flow works as designed. The security properties (policy validation, program ID checks, in-memory signing) are identical regardless of network.

---

## Test Results

All core SDK modules verified with **16 unit tests** (all passing):

| Module | Tests | Status |
|---|---|---|
| SecureKeyStore | Encrypt/Decrypt round-trip, wrong secret rejection, tamper detection, unique ciphertexts | ✅ PASS |
| PolicyEngine | Policy parsing, transfer validation, program whitelisting, DEFAULT_POLICY enforcement | ✅ PASS |

---

## Judge's Setup Guide

### Step 0: Clone
```bash
git clone https://github.com/Willy-Wonka28/Bazar.git
cd Bazar
```

### Step 1: Backend (Already Live)
The Bazar Backend is deployed at **https://bazar-backend.up.railway.app** — no local setup needed.

### Step 2: Build the SDK
```bash
cd agentic-wallet-sdk
npm install
npm run build
```

### Step 3: Install Agent Dependencies
```bash
cd ../agents-demo/trader-agent && npm install
cd ../treasury-agent && npm install
```

### Step 4: Fund the Wallets
**Trader Agent (Mainnet):** On first boot, the agent prints its wallet address. Send at least **0.02 SOL** (mainnet) to cover the swap + fees.

**Treasury Agent (Devnet):** Free airdrop:
```bash
solana airdrop 2 <TREASURY_WALLET_ADDRESS> --url devnet
```

### Step 5: Launch the Command Center
```bash
cd ../../admin-dashboard
npm install && npm run dev
```

Open `http://localhost:3000`, click **Launch Sequence** on either agent tile, and watch the full security flow stream live in the terminal — policy fetch, Jupiter quote, program ID validation, sign, broadcast.

---

## Key Environment Variables

### Agent `.env` (zero database credentials)
| Variable | Value |
|---|---|
| `AGENT_ID` | UUID assigned at registration |
| `ENCRYPTION_SECRET` | Per-agent AES-256-GCM passphrase |
| `BAZAR_BACKEND_URL` | `https://bazar-backend.up.railway.app` |
| `RPC_URL` | Mainnet for Trader, Devnet for Treasury |
| `RPC_URL_FALLBACK` | Alchemy endpoint (auto-failover) |

### Backend `.env` (the only place secrets live)
| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Full-access admin key — server-side only |
| `PORT` | Default: 4000 |

---

## Bounty Requirements Checklist

| Requirement | Where in the code | Status |
|---|---|---|
| Wallet created programmatically | `server.ts:250` — `Keypair.generate()` | ✅ |
| Transactions signed automatically | `walletClient.ts:136,233` — `transaction.sign()` / `swapTx.sign()` | ✅ |
| Holds SOL and SPL tokens | Trader wallet holds SOL + USDC ATA post-swap | ✅ |
| Interacts with a real protocol | `walletClient.ts:187–252` — Jupiter v6 DEX swap, Mainnet | ✅ |
| Policy enforces program whitelist | `policyEngine.ts:66–80` + `walletClient.ts:220–228` | ✅ |
| Secure key management | `secureKeyStore.ts` AES-256-GCM + `walletManager.ts:40` in-memory only | ✅ |
| AI agent decision simulation | `trader-agent/index.ts:83–92` — decision logic in agent, not SDK | ✅ |
| Clear separation of agent vs. wallet | Agents call SDK methods; SDK owns all security logic | ✅ |
| Multiple independent agents | Trader (Mainnet/DeFi) + Treasury (Devnet/Vault), fully isolated | ✅ |
| `SKILLS.md` for agent consumption | `agentic-wallet-sdk/SKILLS.md` | ✅ |
| Open-source with setup instructions | This repo + Judge's Setup Guide above | ✅ |
| Working prototype | Backend live on Railway; agents run with `npm start` | ✅ |
| Automated registration | `trader-agent/index.ts:28–57` — self-registers on first boot, writes `.env` | ✅ |
