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

const BACKEND_URL = process.env.BAZAR_BACKEND_URL || 'http://localhost:4000';
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
    envContent = envContent.replace(/^WALLET_ADDRESS=.*$/m, `WALLET_ADDRESS="${data.walletAddress}"`);
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

        // Persist wallet address to .env so the owner can top up without digging through logs
        if (!process.env.WALLET_ADDRESS) {
            let envContent = fs.readFileSync(ENV_PATH, 'utf-8');
            envContent = envContent.replace(/^WALLET_ADDRESS=.*$/m, `WALLET_ADDRESS="${address.toBase58()}"`);
            fs.writeFileSync(ENV_PATH, envContent, 'utf-8');
        }

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
        const walletAddr = process.env.WALLET_ADDRESS || (await wallet.getWalletAddress().catch(() => null))?.toBase58() || '<wallet address>';

        console.error('\n' + '='.repeat(60));
        console.error('  AGENT EXECUTION HALTED');
        console.error('='.repeat(60));
        console.error(`  Reason: ${error.message}\n`);

        if (error.message.includes('Policy Violation')) {
            console.error('  >> The Security Runtime blocked an unauthorized action.');
            console.error('     This is expected behaviour — the policy gate is working correctly.');

        } else if (
            error.message.toLowerCase().includes('insufficient') ||
            error.message.toLowerCase().includes('balance') ||
            error.message.toLowerCase().includes('lamport') ||
            error.message.toLowerCase().includes('not enough')
        ) {
            console.error('  >> Looks like your Trader Agent is running low on funds.');
            console.error(`     Wallet: ${walletAddr}`);
            console.error('     This agent runs on Mainnet — it needs real SOL.');
            console.error('     Are you sure your Trader Agent has at least 0.02 SOL on Mainnet?');
            console.error('     Send SOL to the wallet address above and try again.');

        } else if (
            error.message.toLowerCase().includes('blockhash') ||
            error.message.toLowerCase().includes('timeout') ||
            error.message.toLowerCase().includes('429') ||
            error.message.toLowerCase().includes('rate limit')
        ) {
            console.error('  >> The RPC endpoint returned an error.');
            console.error('     Both the primary and Alchemy fallback RPCs were tried.');
            console.error('     Wait a few seconds and re-run the agent.');
            console.error('     If the issue persists, check your RPC_URL in .env.');

        } else if (
            error.message.toLowerCase().includes('fetch') ||
            error.message.toLowerCase().includes('econnrefused') ||
            error.message.toLowerCase().includes('network')
        ) {
            console.error('  >> Could not reach the Bazar Backend or Jupiter API.');
            console.error('     Check that BAZAR_BACKEND_URL is correct in your .env');
            console.error('     and that you have an active internet connection.');

        } else if (error.message.toLowerCase().includes('registration failed')) {
            console.error('  >> Agent registration with the Bazar Backend failed.');
            console.error('     Check that BAZAR_BACKEND_URL is reachable:');
            console.error(`     ${process.env.BAZAR_BACKEND_URL || 'https://bazar-backend.up.railway.app'}`);

        } else {
            console.error('  >> Something unexpected went wrong.');
            console.error(`     Wallet: ${walletAddr}`);
            console.error('     Are you sure your Trader Agent has at least 0.02 SOL on Mainnet?');
            console.error('     Double-check your .env config and try again.');
        }

        console.error('\n' + '='.repeat(60) + '\n');
    }
}

main();
