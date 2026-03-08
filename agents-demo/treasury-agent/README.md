# Treasury Agent (Demo Environment)

This directory simulates an autonomous, heavily restricted AI Treasury Agent on the Solana Devnet.

Treasury vaults generally have strict `max_tx_amount` rules to prevent sudden, catastrophic drains of liquidity. The `agentic-wallet-sdk` strictly intercepts all intents to ensure payouts do not exceed limits established by the operator.

## 🚀 How to Run

1. Ensure the SDK is built (`npm run build` in the parent directory).
2. Install dependencies here (`npm install`).
3. Fill out the `.env` file with your corresponding Supabase Anon Key.
4. Run the demo: `npm start`

Watch the console as the runtime ensures the safety constraints of the vault before approving the payout!
