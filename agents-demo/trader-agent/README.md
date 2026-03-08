# Trader Agent (Demo Environment)

This directory simulates an autonomous AI Trader operating on the Solana Devnet.

It utilizes the `agentic-wallet-sdk` to execute `transferSol` and `executeTransaction` intents. Behind the scenes, the SDK pulls the `trader-agent` policy from the central Supabase registry and enforces it before signing any actions.

## 🚀 How to Run

1. Ensure the SDK is built (`npm run build` in the parent directory).
2. Install dependencies here (`npm install`).
3. Fill out the `.env` file with your Supabase credentials (a policy limiting transactions must exist in the database!).
4. Run the demo: `npm start`

Watch the console as the agent boots up, loads its policy securely, and attempts a trade on-chain!
