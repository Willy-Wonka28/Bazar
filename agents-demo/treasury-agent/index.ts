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
    envContent = envContent.replace(/^WALLET_ADDRESS=.*$/m, `WALLET_ADDRESS="${data.walletAddress}"`);
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

        // Persist wallet address to .env so the owner can top up without digging through logs
        if (!process.env.WALLET_ADDRESS) {
            let envContent = fs.readFileSync(ENV_PATH, 'utf-8');
            envContent = envContent.replace(/^WALLET_ADDRESS=.*$/m, `WALLET_ADDRESS="${address.toBase58()}"`);
            fs.writeFileSync(ENV_PATH, envContent, 'utf-8');
        }

        // --- PAYOUT SCENARIO ---
        // Simulates a weekly payout by sending SOL to the Trader Agent's wallet
        console.log("Treasury Decision: Approving standard weekly worker payout of 0.1 SOL.");

        const traderWallet = "FHTVGGMau4PpjhQf3xreTvNyXt8yFLNzcKzAxMim27qw";

        console.log(`Processing payout to ${traderWallet}...`);
        const signature = await wallet.transferSol(traderWallet, 0.1);

        console.log(`Payout Confirmed! Devnet Signature: ${signature}`);

    } catch (error: any) {
        const walletAddr = process.env.WALLET_ADDRESS || (await wallet.getWalletAddress().catch(() => null))?.toBase58() || '<wallet address>';

        console.error('\n' + '='.repeat(60));
        console.error('  TREASURY EXECUTION HALTED');
        console.error('='.repeat(60));
        console.error(`  Reason: ${error.message}\n`);

        if (error.message.includes('Policy Violation')) {
            console.error('  >> The Security Runtime blocked an unauthorized action.');
            console.error('     This is expected behaviour — the policy gate is working correctly.');
            console.error('     The Treasury policy caps transfers at 0.1 SOL to the System Program only.');

        } else if (
            error.message.toLowerCase().includes('insufficient') ||
            error.message.toLowerCase().includes('balance') ||
            error.message.toLowerCase().includes('lamport') ||
            error.message.toLowerCase().includes('not enough')
        ) {
            console.error('  >> The Treasury Vault is out of funds.');
            console.error(`     Wallet: ${walletAddr}`);
            console.error('     This agent runs on Devnet — you can get free SOL via airdrop:');
            console.error(`     solana airdrop 2 ${walletAddr} --url devnet`);
            console.error('     Are you sure your Treasury Agent has enough SOL on Devnet?');

        } else if (
            error.message.toLowerCase().includes('blockhash') ||
            error.message.toLowerCase().includes('timeout') ||
            error.message.toLowerCase().includes('429') ||
            error.message.toLowerCase().includes('rate limit')
        ) {
            console.error('  >> The Devnet RPC returned an error.');
            console.error('     Devnet can be flaky — wait a few seconds and re-run the agent.');
            console.error('     If the issue persists, check your RPC_URL in .env.');

        } else if (
            error.message.toLowerCase().includes('fetch') ||
            error.message.toLowerCase().includes('econnrefused') ||
            error.message.toLowerCase().includes('network')
        ) {
            console.error('  >> Could not reach the Bazar Backend.');
            console.error('     Check that BAZAR_BACKEND_URL is correct in your .env');
            console.error('     and that you have an active internet connection.');

        } else if (error.message.toLowerCase().includes('registration failed')) {
            console.error('  >> Agent registration with the Bazar Backend failed.');
            console.error('     Check that BAZAR_BACKEND_URL is reachable:');
            console.error(`     ${process.env.BAZAR_BACKEND_URL || 'https://bazar-backend.up.railway.app'}`);

        } else {
            console.error('  >> Something unexpected went wrong.');
            console.error(`     Wallet: ${walletAddr}`);
            console.error('     Are you sure your Treasury Agent has enough SOL on Devnet?');
            console.error(`     Run: solana airdrop 2 ${walletAddr} --url devnet`);
            console.error('     Then double-check your .env config and try again.');
        }

        console.error('\n' + '='.repeat(60) + '\n');
    }
}

main();
