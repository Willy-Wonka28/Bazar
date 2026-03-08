# Wallet SDK Skills

This document outlines the capabilities (Skills) available to AI agents via the `agentic-wallet-sdk`.

The SDK separates decision-making from execution. You, the AI agent, request an action, and the SDK verifies it against your assigned, immutable policy (e.g. `max_tx_amount`, `allowed_programs`) before executing and signing it automatically.

---

## 1. Setup & Onboarding

### Prerequisites
1. The **Bazar Backend** is live at `https://bazar-backend.up.railway.app` — no local setup needed.
2. Register yourself by running `npx bazar init` and selecting a role.
3. Copy the output (`AGENT_ID`, `ENCRYPTION_SECRET`) into your `.env` file.

### Initialize the WalletClient
```typescript
import { WalletClient } from 'agentic-wallet-sdk';
import 'dotenv/config';

const wallet = new WalletClient({
    agentId: process.env.AGENT_ID as string,
    rpcUrl: process.env.RPC_URL || "https://api.devnet.solana.com",
    rpcUrlFallback: process.env.RPC_URL_FALLBACK,
    backendUrl: process.env.BAZAR_BACKEND_URL || "https://bazar-backend.up.railway.app",
    encryptionSecret: process.env.ENCRYPTION_SECRET as string,
});

await wallet.initialize();
```

### Agent .env Variables
```
AGENT_ID="<from npx bazar init>"
RPC_URL="https://api.devnet.solana.com"
RPC_URL_FALLBACK="https://solana-devnet.g.alchemy.com/v2/RJ3djVqdsC3rT3OWJopz_"
BAZAR_BACKEND_URL="https://bazar-backend.up.railway.app"
ENCRYPTION_SECRET="<from npx bazar init>"
```

> **Note:** Agents have zero database credentials. All data flows through the Bazar Backend.

---

## 2. transferSol

Transfers native SOL to a specified wallet address. If the transfer amount exceeds your policy constraints, the SDK throws an error immediately.

### Signature
`await wallet.transferSol(toAddress: string, amountSol: number): Promise<string>`

### Example
```typescript
try {
    const signature = await wallet.transferSol("DestinationPublicKeyBase58", 0.5);
    console.log("Success! TX:", signature);
} catch (error) {
    console.error("Policy denied transfer:", error.message);
}
```

---

## 3. executeTransaction

For complex interactions (e.g., swapping tokens, creating accounts, or interacting with custom protocols), formulate the raw Solana Web3 transaction instructions and pass them directly to the SDK.

The SDK will validate every instruction against your `allowed_programs` list before signing.

### Signature
`await wallet.executeTransaction(instructions: TransactionInstruction[]): Promise<string>`

### Example
```typescript
import { TransactionInstruction, PublicKey } from '@solana/web3.js';

const myCustomIx = new TransactionInstruction({
    keys: [...],
    programId: new PublicKey("TargetProgramID"),
    data: Buffer.from([...])
});

const signature = await wallet.executeTransaction([myCustomIx]);
```

---

## 4. executeJupiterSwap

Executes a token swap via the **Jupiter v6 Aggregator** on Devnet. Jupiter finds the best route across all available liquidity pools and returns an optimized `VersionedTransaction`.

The SDK:
1. Fetches a quote from `https://quote-api.jup.ag/v6/quote`.
2. Retrieves the swap transaction from `https://quote-api.jup.ag/v6/swap`.
3. Extracts every program ID from the transaction and validates them against your `allowed_programs` policy.
4. Signs and broadcasts the transaction with Alchemy RPC fallback.

To use this skill, your agent must be registered with the `trader` role (`DeFi Trader` policy), which whitelists Jupiter's program ID.

### Signature
`await wallet.executeJupiterSwap(inputMint: string, outputMint: string, amountLamports: number, slippageBps?: number): Promise<string>`

### Example — Swap 0.01 SOL → USDC
```typescript
import { WalletClient, DEVNET_MINTS } from 'agentic-wallet-sdk';

const signature = await wallet.executeJupiterSwap(
    DEVNET_MINTS.SOL,   // So11111111111111111111111111111111111111112
    DEVNET_MINTS.USDC,  // 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
    10_000_000          // 0.01 SOL in lamports
);
console.log("Swap confirmed:", signature);
```

### Available Devnet Mints (`DEVNET_MINTS`)
| Constant | Mint Address |
|---|---|
| `DEVNET_MINTS.SOL` | `So11111111111111111111111111111111111111112` |
| `DEVNET_MINTS.USDC` | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |

### DeFi Trader Policy — Required Whitelisted Programs
| Program | Address |
|---|---|
| System Program | `11111111111111111111111111111111` |
| Jupiter v6 Aggregator | `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` |
| SPL Token Program | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` |
| Associated Token Account | `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bRS` |

---

## 5. getWalletAddress

Agents do not hold their raw private keys. If you need your public address for formatting an instruction:

```typescript
const myAddress = await wallet.getWalletAddress();
console.log("My Wallet is:", myAddress.toBase58());
```

---

## Security Notes

- Your private key is encrypted with your unique `ENCRYPTION_SECRET` and stored in Supabase. The raw key never persists — it only exists in memory during signing.
- If no policy is found for your agent, the SDK applies a restrictive **Default Policy** (Standard Trader policy (1.5 SOL, 5 tx/min, System Program only)).
- If the primary RPC fails, the SDK automatically retries via the Alchemy fallback endpoint.
- For Jupiter swaps, program IDs are extracted directly from the `VersionedTransaction` returned by Jupiter and validated against `allowed_programs` — the policy check cannot be bypassed.
