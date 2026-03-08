# Wallet SDK Skills

This document outlines the capabilities (Skills) available to AI agents via the `agentic-wallet-sdk`.

The SDK separates decision-making from execution. You, the AI agent, request an action, and the SDK verifies it against your assigned, immutable policy (e.g. `max_tx_amount`, `allowed_programs`) before executing and signing it automatically.

---

## 1. Setup & Onboarding

### Prerequisites
1. The **Bazar Backend** must be running (`cd bazar-backend && npm run dev`).
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
    backendUrl: process.env.BAZAR_BACKEND_URL || "http://localhost:4000",
    encryptionSecret: process.env.ENCRYPTION_SECRET as string,
});

await wallet.initialize();
```

### Agent .env Variables
```
AGENT_ID="<from npx bazar init>"
RPC_URL="https://api.devnet.solana.com"
RPC_URL_FALLBACK="https://solana-devnet.g.alchemy.com/v2/RJ3djVqdsC3rT3OWJopz_"
BAZAR_BACKEND_URL="http://localhost:4000"
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

## 4. getWalletAddress

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
