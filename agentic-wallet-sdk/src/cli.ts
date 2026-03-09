#!/usr/bin/env node

/**
 * Bazar CLI — Interactive Agent Onboarding
 * 
 * Usage: npx bazar init
 * 
 * Calls the Bazar Backend to register a new agent:
 * 1. Fetches available roles from the backend
 * 2. Asks what type of agent and its name
 * 3. Backend generates keypair, encrypts it, and registers in Supabase
 * 4. Outputs the AGENT_ID, WALLET_ADDRESS, and ENCRYPTION_SECRET
 */

import * as readline from 'readline';
import figlet from 'figlet';
import chalk from 'chalk';

const BACKEND_URL = process.env.BAZAR_BACKEND_URL || 'http://localhost:4000';

function askQuestion(rl: readline.Interface, question: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer.trim()));
    });
}

async function main() {
    // Print the golden BAZAR header
    try {
        console.log(
            chalk.hex('#FFD700')(
                figlet.textSync('Bazar', { horizontalLayout: 'full' })
            )
        );
    } catch (_) { /* ignore figlet errors */ }

    console.log(chalk.gray('  Agentic Wallet Security Runtime\n'));
    console.log(chalk.white('═══════════════════════════════════════════'));
    console.log(chalk.white('  AGENT ONBOARDING'));
    console.log(chalk.white('═══════════════════════════════════════════\n'));

    // Step 1: Fetch available roles from the backend
    console.log(chalk.gray('  Fetching available roles...\n'));
    let policies: Array<{ role: string; name: string; rules: any }>;

    try {
        const res = await fetch(`${BACKEND_URL}/api/policies`);
        const data = await res.json();
        policies = data.policies;
    } catch (err: any) {
        console.error(chalk.red(`\n  Cannot reach the Bazar Backend at ${BACKEND_URL}`));
        console.error(chalk.gray('  Make sure the backend is running: cd bazar-backend && npm run dev'));
        process.exit(1);
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    // Display roles
    console.log(chalk.white('  What type of agent is this?\n'));
    policies.forEach((p, i) => {
        const rulesStr = `max ${p.rules.max_tx_amount} SOL, ${p.rules.max_tx_per_minute} tx/min`;
        console.log(chalk.gray(`    ${i + 1}) ${p.name.padEnd(20)} (${rulesStr})`));
    });
    console.log('');

    const roleChoice = await askQuestion(rl, chalk.white('  Select role [number]: '));
    const selectedIndex = parseInt(roleChoice, 10) - 1;

    if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= policies.length) {
        console.error(chalk.red('\n  Invalid selection. Exiting.'));
        rl.close();
        process.exit(1);
    }

    const selectedRole = policies[selectedIndex];

    // Step 2: Ask for agent name
    const agentName = await askQuestion(rl, chalk.white('  Agent name: '));
    if (!agentName) {
        console.error(chalk.red('\n  Agent name cannot be empty. Exiting.'));
        rl.close();
        process.exit(1);
    }

    rl.close();
    console.log('');

    // Step 3: Register via backend
    console.log(chalk.gray('  Registering agent via Bazar Backend...'));

    try {
        const res = await fetch(`${BACKEND_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: agentName, role: selectedRole.role }),
        });

        const result = await res.json();

        if (!res.ok) {
            console.error(chalk.red(`\n  Registration failed: ${result.error}`));
            process.exit(1);
        }

        // Success output
        console.log('\n' + chalk.white('═══════════════════════════════════════════'));
        console.log(chalk.hex('#FFD700')('  AGENT REGISTERED SUCCESSFULLY'));
        console.log(chalk.white('═══════════════════════════════════════════\n'));

        console.log(chalk.white(`  Agent ID:           ${result.agentId}`));
        console.log(chalk.white(`  Wallet Address:     ${result.walletAddress}`));
        console.log(chalk.white(`  Policy:             ${result.policyName}`));
        console.log(chalk.white(`  Encryption Secret:  ${result.encryptionSecret}`));

        console.log('\n' + chalk.gray('  Copy this into your agent .env file:\n'));
        console.log(chalk.white(`  AGENT_ID="${result.agentId}"`));
        console.log(chalk.white(`  ENCRYPTION_SECRET="${result.encryptionSecret}"`));
        console.log(chalk.white(`  BAZAR_BACKEND_URL="${BACKEND_URL}"`));
        const isMainnet = selectedRole.role === 'trader';
        const rpcUrl = isMainnet ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com';
        console.log(chalk.white(`  RPC_URL="${rpcUrl}"`));
        console.log(chalk.white(`  RPC_URL_FALLBACK=""`));

        console.log('\n' + chalk.gray('  Fund your wallet:'));
        if (isMainnet) {
            console.log(chalk.white(`  Send at least 0.02 SOL (Mainnet) to ${result.walletAddress}\n`));
        } else {
            console.log(chalk.white(`  solana airdrop 2 ${result.walletAddress} --url devnet\n`));
        }

    } catch (err: any) {
        console.error(chalk.red(`\n  Registration failed: ${err.message}`));
        process.exit(1);
    }
}

main().catch((err) => {
    console.error(chalk.red(`\n  FATAL: ${err.message}`));
    process.exit(1);
});
