import { WalletClient } from 'agentic-wallet-sdk';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

// -------------------------------------------------------------
// Treasury Agent Demo Script
// -------------------------------------------------------------
// On first boot, the agent self-registers via the Bazar Backend,
// writes its credentials to .env, and then executes a payout.
// On subsequent boots, it reads existing credentials from .env.

const BACKEND_URL = process.env.BAZAR_BACKEND_URL || 'http://localhost:4000';
const ENV_PATH = path.resolve(__dirname, '.env');

/**
 * Self-registers this agent if AGENT_ID is missing from .env.
 * Calls the backend, writes credentials back to .env.
 */
async function ensureRegistered(): Promise<{ agentId: string; encryptionSecret: string }> {
    if (process.env.AGENT_ID) {
        return { agentId: process.env.AGENT_ID, encryptionSecret: process.env.ENCRYPTION_SECRET! };
    }

    console.log('[AUTO-REGISTER] No AGENT_ID found. Registering as Treasury...');

    const res = await fetch(`${BACKEND_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Treasury Agent', role: 'treasury' }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(`Registration failed: ${data.error}`);

    console.log(`[AUTO-REGISTER] Registered! Agent ID: ${data.agentId}`);
    console.log(`[AUTO-REGISTER] Wallet: ${data.walletAddress}`);
    console.log(`[AUTO-REGISTER] Policy: ${data.policyName}`);

    // Write credentials back to .env
    let envContent = fs.readFileSync(ENV_PATH, 'utf-8');
    envContent = envContent.replace(/^AGENT_ID=.*$/m, `AGENT_ID="${data.agentId}"`);
    envContent = envContent.replace(/^ENCRYPTION_SECRET=.*$/m, `ENCRYPTION_SECRET="${data.encryptionSecret}"`);
    fs.writeFileSync(ENV_PATH, envContent, 'utf-8');

    console.log(`[AUTO-REGISTER] Credentials saved to .env\n`);

    return { agentId: data.agentId, encryptionSecret: data.encryptionSecret };
}

async function main() {
    console.log("Treasury Agent initializing...\n");

    const { agentId, encryptionSecret } = await ensureRegistered();

    const wallet = new WalletClient({
        agentId,
        rpcUrl: process.env.RPC_URL || "https://api.devnet.solana.com",
        rpcUrlFallback: process.env.RPC_URL_FALLBACK,
        backendUrl: BACKEND_URL,
        encryptionSecret,
    });

    try {
        await wallet.initialize();
        const address = await wallet.getWalletAddress();
        console.log(`Locked Vault loaded. Public Address: ${address.toBase58()}`);

        // --- PAYOUT SCENARIO ---
        // Simulates a weekly payout by sending SOL to the Trader Agent's wallet
        console.log("Treasury Decision: Approving standard weekly worker payout of 0.1 SOL.");

        const traderWallet = "FHTVGGMau4PpjhQf3xreTvNyXt8yFLNzcKzAxMim27qw";

        console.log(`Processing payout to ${traderWallet}...`);
        const signature = await wallet.transferSol(traderWallet, 0.1);

        console.log(`Payout Confirmed! Devnet Signature: ${signature}`);

    } catch (error: any) {
        console.error(`\nTREASURY EXECUTION BLOCKED: ${error.message}`);
        console.log(`The Security Runtime prevents unauthorized vault depletion.`);
    }
}

main();
