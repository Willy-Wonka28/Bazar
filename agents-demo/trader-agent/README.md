# Trader Agent — Jupiter DEX Swap Demo

This agent simulates an autonomous AI trader operating on Solana Devnet. It uses the `agentic-wallet-sdk` to execute a **real Jupiter v6 DEX swap** — swapping **0.01 SOL → USDC** on every run.

The swap is not just a demonstration of signing: the SDK's Policy Engine intercepts the request, extracts every program ID from Jupiter's returned `VersionedTransaction`, and validates them against the agent's `DeFi Trader` policy before a single byte is signed.

---

## What It Does

1. **Auto-registers** on first boot — calls `POST /api/register` on the Bazar Backend, receives a `DeFi Trader` policy (which whitelists Jupiter's program ID), and saves credentials to `.env`.
2. **Loads its encrypted wallet** from the backend. The private key is decrypted in-memory only.
3. **Fetches a Jupiter quote** for SOL → USDC via `https://quote-api.jup.ag/v6/quote`.
4. **Policy validation** — the SDK extracts all program IDs from Jupiter's `VersionedTransaction` and confirms each one is in `allowed_programs`.
5. **Signs and broadcasts** the swap to Devnet, printing the confirmed transaction signature and Explorer link.

---

## Token Addresses (Devnet)

| Token | Mint Address |
|---|---|
| Wrapped SOL | `So11111111111111111111111111111111111111112` |
| USDC (Circle Devnet) | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |

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
BAZAR_BACKEND_URL="https://bazar-backend.up.railway.app"
RPC_URL="https://api.devnet.solana.com"
RPC_URL_FALLBACK="https://solana-devnet.g.alchemy.com/v2/<your-key>"
```

### 4. Fund the wallet
The agent needs SOL to pay for the swap and transaction fees. After first boot (or after `npx bazar init`) you'll see the wallet address:
```bash
solana airdrop 2 <WALLET_ADDRESS> --url devnet
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
Output: USDC  (4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU)
Fetching best route from Jupiter...

=======================================================
  SWAP CONFIRMED
=======================================================
  Devnet Signature: <signature>
  Explorer: https://explorer.solana.com/tx/<signature>?cluster=devnet
=======================================================
```
