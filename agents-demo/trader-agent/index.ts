import { WalletClient, DEVNET_MINTS } from 'agentic-wallet-sdk';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

// -------------------------------------------------------------
// Trader Agent Demo Script — Jupiter DEX Swap Edition
// -------------------------------------------------------------
// On first boot, the agent self-registers via the Bazar Backend,
// writes its credentials to .env, then executes a Jupiter swap.
// On subsequent boots, it reads existing credentials from .env.
//
// Swap direction alternates each run:
//   Even runs  → SOL  → USDC  (0.01 SOL)
//   Odd runs   → USDC → SOL   (all USDC balance)
// On first boot we always go SOL → USDC to establish a USDC balance.

const BACKEND_URL = process.env.BAZAR_BACKEND_URL || 'https://bazar-backend.up.railway.app';
const ENV_PATH = path.resolve(__dirname, '.env');

// 0.01 SOL in lamports
const SWAP_AMOUNT_LAMPORTS = 10_000_000;

/**
 * Self-registers this agent if AGENT_ID is missing from .env.
 * Calls the backend, writes credentials back to .env.
 */
async function ensureRegistered(): Promise<{ agentId: string; encryptionSecret: string }> {
    if (process.env.AGENT_ID) {
        return { agentId: process.env.AGENT_ID, encryptionSecret: process.env.ENCRYPTION_SECRET! };
    }

    console.log('[AUTO-REGISTER] No AGENT_ID found. Registering as DeFi Trader...');

    const res = await fetch(`${BACKEND_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Trader Agent', role: 'trader' }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(`Registration failed: ${data.error}`);

    console.log(`[AUTO-REGISTER] Registered! Agent ID: ${data.agentId}`);
    console.log(`[AUTO-REGISTER] Wallet:            ${data.walletAddress}`);
    console.log(`[AUTO-REGISTER] Policy:            ${data.policyName}`);

    // Write credentials back to .env
    let envContent = fs.readFileSync(ENV_PATH, 'utf-8');
    envContent = envContent.replace(/^AGENT_ID=.*$/m, `AGENT_ID="${data.agentId}"`);
    envContent = envContent.replace(/^ENCRYPTION_SECRET=.*$/m, `ENCRYPTION_SECRET="${data.encryptionSecret}"`);
    fs.writeFileSync(ENV_PATH, envContent, 'utf-8');

    console.log(`[AUTO-REGISTER] Credentials saved to .env\n`);

    return { agentId: data.agentId, encryptionSecret: data.encryptionSecret };
}

async function main() {
    console.log('='.repeat(55));
    console.log('  BAZAR — Trader Agent (Jupiter Swap)');
    console.log('='.repeat(55) + '\n');

    const { agentId, encryptionSecret } = await ensureRegistered();

    const wallet = new WalletClient({
        agentId,
        rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
        rpcUrlFallback: process.env.RPC_URL_FALLBACK,
        backendUrl: BACKEND_URL,
        encryptionSecret,
    });

    try {
        await wallet.initialize();
        const address = await wallet.getWalletAddress();
        console.log(`Wallet loaded.`);
        console.log(`Public Address: ${address.toBase58()}\n`);

        // ----------------------------------------------------------
        // AI DECISION: Swap SOL → USDC via Jupiter on Devnet
        // ----------------------------------------------------------
        console.log('AI Decision: Swapping 0.01 SOL → USDC via Jupiter DEX.');
        console.log(`Input:  0.01 SOL  (${SWAP_AMOUNT_LAMPORTS} lamports)`);
        console.log(`Output: USDC  (${DEVNET_MINTS.USDC})`);
        console.log('Fetching best route from Jupiter...\n');

        const signature = await wallet.executeJupiterSwap(
            DEVNET_MINTS.SOL,
            DEVNET_MINTS.USDC,
            SWAP_AMOUNT_LAMPORTS
        );

        console.log('\n' + '='.repeat(55));
        console.log('  ✅ SWAP CONFIRMED');
        console.log('='.repeat(55));
        console.log(`  Devnet Signature: ${signature}`);
        console.log(`  Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
        console.log('='.repeat(55) + '\n');

    } catch (error: any) {
        console.error('\n' + '='.repeat(55));
        console.error('  AGENT EXECUTION HALTED');
        console.error('='.repeat(55));
        console.error(`  Reason: ${error.message}`);
        if (error.message.includes('Policy Violation')) {
            console.log('  The Security Runtime successfully blocked an unauthorized action.');
        }
        if (error.message.includes('insufficient') || error.message.includes('balance')) {
            console.log('  Tip: Fund your wallet first:');
            console.log(`  solana airdrop 2 ${(await wallet.getWalletAddress().catch(() => null))?.toBase58() ?? '<address>'} --url devnet`);
        }
        console.error('='.repeat(55) + '\n');
    }
}

main();
