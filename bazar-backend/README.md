# Bazar Backend — Secure Middleware

The Bazar Backend is a lightweight Express server that acts as the **sole trusted gateway** between AI agents and the Supabase database. It is the only component in the entire system that holds the `SUPABASE_SERVICE_ROLE_KEY` — agents never touch the database directly.

## Why It Exists

In the Bazar architecture, AI agents are treated as **untrusted processes**. They have no database credentials, no direct Supabase access, and no ability to read other agents' data. Every sensitive operation — key generation, agent provisioning, policy lookup — is mediated through this backend, enforcing a strict zero-trust boundary.

## What It Does

- **Agent Registration** (`POST /api/register`) — Generates a fresh Solana keypair, encrypts the private key with a per-agent AES-256-GCM secret, creates the agent's policy in the database (if it doesn't already exist), and returns the agent's credentials.
- **Encrypted Key Retrieval** (`GET /api/agent/:id`) — Returns an agent's encrypted private key and wallet address so the SDK can decrypt it in-memory for signing.
- **Policy Lookup** (`GET /api/agent/:id/policy`) — Returns the policy rules (amount caps, rate limits, allowed programs) assigned to a specific agent. The SDK calls this at boot to know what transactions are permitted.
- **Policy Listing** (`GET /api/policies`) — Lists all available role templates (e.g. Standard Trader, Treasury Vault) and their rule sets. Used by the CLI during `npx bazar init`.

## Security Design

| Principle | Implementation |
|---|---|
| **Zero agent credentials** | Agents have no Supabase URL, anon key, or service role key |
| **AES-256-GCM encryption** | Private keys are encrypted with a unique 32-char hex secret per agent |
| **Server-side only secrets** | The `service_role` key lives only in this backend's `.env` |
| **Row Level Security** | Supabase RLS blocks all public `SELECT` on the agents table — even if credentials leaked, the database rejects direct queries |

## Running Locally

```bash
cd bazar-backend
npm install
npm run dev        # starts with ts-node on port 4000
```

### Environment Variables

Create a `.env` file (see `.env.example`):

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Full-access admin key (never shared with agents) |
| `PORT` | Server port (default: `4000`) |
