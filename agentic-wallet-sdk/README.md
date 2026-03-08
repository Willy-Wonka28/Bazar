# Agentic Wallet SDK

A lightweight, secure runtime for autonomous AI agents on the Solana blockchain (Devnet only).

The runtime separates **Decision Making** (the AI) from **Execution** (the Wallet). Agents request actions, and the SDK validates them against strict policies before signing.

---

## Architecture

1. **Bazar Backend**: The sole holder of database credentials. Handles registration, policy lookup, and encrypted key retrieval. Agents never touch Supabase.
2. **Policy Engine**: Validates every agent request against immutable rules using Zod. Agents without a policy receive a restrictive default (Standard Trader: 1.5 SOL, 5 tx/min, System Program only).
3. **Secure Key Store**: Encrypts private keys with per-agent AES-256-GCM secrets. Raw keys exist only in memory during signing.
4. **Wallet Client**: The bridge inside the agent. Fetches policy and encrypted key from the backend, decrypts in memory, signs, broadcasts to Devnet with Alchemy RPC fallback.

---

## Security Model

- **Zero Database Exposure**: Agents have no Supabase credentials. All data access goes through the backend.
- **Agent Isolation**: RLS blocks all public SELECT on the agents table. Agents cannot see each other.
- **Per-Agent Encryption**: Each agent's keypair is encrypted with a unique secret. Compromising one exposes zero others.
- **In-Memory Signing**: Keys decrypted only for the millisecond needed to sign, then erased.
- **Default Policy**: Unregistered agents are automatically restricted (Standard Trader: 1.5 SOL, 5 tx/min, System Program).
- **Dual RPC Failover**: Automatic Alchemy fallback if primary Solana RPC fails.

---

## Quick Start

1. Start the backend: `cd bazar-backend && npm run dev`
2. Build the SDK: `npm run build`
3. Register an agent: `npx bazar init`
4. See `SKILLS.md` for the full agent API reference.

*Built for the Solana Agentic Wallet Bounty.*
