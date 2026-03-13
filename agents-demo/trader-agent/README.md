# Trader Agent — Jupiter DEX Swap Demo

This agent simulates an autonomous AI trader operating on Solana **Mainnet**. It uses the `agentic-wallet-sdk` to execute a **real Jupiter v6 DEX swap** — swapping **0.01 SOL → USDC** on every run.

The swap is not just a demonstration of signing: the SDK's Policy Engine intercepts the request, extracts every program ID from Jupiter's returned `VersionedTransaction`, and validates them against the agent's `DeFi Trader` policy before a single byte is signed.

> **Note on Jupiter API:** Jupiter's aggregator API (`lite-api.jup.ag`) only supports **mainnet liquidity pools**. There is no devnet equivalent — Jupiter does not operate routing infrastructure on Solana Devnet. For this reason, the Trader Agent is intentionally wired to mainnet. The full security flow (quote fetch → program ID extraction → policy validation → sign → broadcast) works exactly as designed on mainnet. The Treasury Agent remains on Devnet.

---

## What It Does

1. **Auto-registers** on first boot — calls `POST /api/register` on the Bazar Backend, receives a `DeFi Trader` policy (which whitelists Jupiter's program ID), and saves credentials to `.env`.
2. **Loads its encrypted wallet** from the backend. The private key is decrypted in-memory only.
3. **Fetches a Jupiter quote** for SOL → USDC via `https://lite-api.jup.ag/swap/v1/quote`.
4. **Policy validation** — the SDK extracts all program IDs from Jupiter's `VersionedTransaction` and confirms each one is in `allowed_programs`.
5. **Signs and broadcasts** the swap to Mainnet, printing the confirmed transaction signature and Explorer link.

---

## Token Addresses (Mainnet)

| Token | Mint Address |
|---|---|
| Wrapped SOL | `So11111111111111111111111111111111111111112` |
| USDC (Circle) | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |

---

## DeFi Trader Policy — Whitelisted Programs

| Program | Address |
|---|---|
| System Program | `11111111111111111111111111111111` |
| Jupiter v6 Aggregator | `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` |
| SPL Token Program | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` |
| Associated Token Account | `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bRS` |

Any program outside this list triggers a `Policy Violation` and the transaction is rejected before signing.

---

## How to Run

### 1. Build the SDK
```bash
cd ../../agentic-wallet-sdk
npm install && npm run build
```

### 2. Install dependencies
```bash
cd ../agents-demo/trader-agent
npm install
```

### 3. Configure `.env`
On first boot the agent auto-registers and fills these in. You can also set them manually after running `npx bazar init`:
```env
AGENT_ID=""
ENCRYPTION_SECRET=""
BAZAR_BACKEND_URL="https://bazar-y2v7.onrender.com"
RPC_URL="https://api.mainnet-beta.solana.com"
RPC_URL_FALLBACK="https://solana-mainnet.g.alchemy.com/v2/<your-key>"
```

### 4. Fund the wallet
The agent needs real SOL (mainnet) to pay for the swap and transaction fees. After first boot (or after `npx bazar init`) you'll see the wallet address. Transfer a small amount of SOL to it:
```
Minimum recommended: 0.02 SOL (covers swap + fees)
```

### 5. Run
```bash
npm start
```

---

## Expected Output

```
=======================================================
  BAZAR — Trader Agent (Jupiter Swap)
=======================================================

Wallet loaded.
Public Address: <your-wallet-address>

AI Decision: Swapping 0.01 SOL → USDC via Jupiter DEX.
Input:  0.01 SOL  (10000000 lamports)
Output: USDC  (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)
Fetching best route from Jupiter...

=======================================================
  ✅ SWAP CONFIRMED
=======================================================
  Signature: <signature>
  Explorer: https://explorer.solana.com/tx/<signature>
=======================================================
```
