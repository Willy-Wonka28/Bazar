import figlet from 'figlet';
import chalk from 'chalk';

function initSDK() {
    try {
        // print the golden "Bazar" text in terminal
        console.log(
            chalk.hex('#FFD700')(
                figlet.textSync('Bazar', { horizontalLayout: 'full' })
            )
        );
        console.log(chalk.gray('Agentic Wallet SDK initialized.'));
    } catch (error) {
        // if any error, the Bazar will not be printed in the terminal
    }
}

initSDK();

// Export core modules for SDK users.
export * from './secureKeyStore';
export * from './walletManager';
export * from './policyEngine';
export * from './agentRegistry';
export * from './transactionBuilder';
export * from './observability';
export * from './walletClient';
