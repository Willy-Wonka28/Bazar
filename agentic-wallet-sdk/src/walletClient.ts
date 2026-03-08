import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { PolicyEngine, DEFAULT_POLICY, AgentPolicy } from './policyEngine';
import { TransactionBuilder } from './transactionBuilder';
import { WalletManager } from './walletManager';
import { Observability } from './observability';

/**
 * Configuration needed to instantiate the WalletClient.
 */
export interface WalletClientConfig {
    agentId: string;
    rpcUrl: string; // e.g., https://api.devnet.solana.com
    rpcUrlFallback?: string; // e.g., Alchemy Devnet endpoint
    backendUrl: string; // Bazar Backend URL (e.g., https://bazar-backend.up.railway.app)
    encryptionSecret: string;
}

/**
 * The primary interface for an AI Agent to interact with the broader blockchain.
 * It strictly enforces policies *before* constructing and signing any requested transactions.
 * All data access goes through the Bazar Backend — agents never touch Supabase directly.
 */
export class WalletClient {
    private readonly config: WalletClientConfig;
    private readonly connection: Connection;
    private readonly fallbackConnection: Connection | null;
    private readonly policyEngine: PolicyEngine;
    private readonly walletManager: WalletManager;
    private readonly builder: TransactionBuilder;

    constructor(config: WalletClientConfig) {
        this.config = config;
        this.connection = new Connection(config.rpcUrl, 'confirmed');
        this.fallbackConnection = config.rpcUrlFallback
            ? new Connection(config.rpcUrlFallback, 'confirmed')
            : null;
        this.policyEngine = new PolicyEngine();
        this.walletManager = new WalletManager(config.encryptionSecret, config.backendUrl);
        this.builder = new TransactionBuilder();
    }

    /**
     * Bootstraps the agent by verifying connectivity.
     * Must be called before any execution.
     */
    public async initialize(): Promise<void> {
        Observability.logAction(this.config.agentId, 'INITIALIZED_SDK', {});
    }

    /**
     * Resolves the agent's policy from the Bazar Backend. Falls back to DEFAULT_POLICY
     * if the agent is not registered or has no policy configured.
     */
    private async resolvePolicy(): Promise<AgentPolicy> {
        try {
            const res = await fetch(`${this.config.backendUrl}/api/agent/${this.config.agentId}/policy`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Policy not found');
            }

            return this.policyEngine.parsePolicy(data.rules);
        } catch (error: any) {
            Observability.logSecurityEvent(
                this.config.agentId,
                'POLICY_FALLBACK',
                `Agent policy not found, applying DEFAULT_POLICY: ${error.message}`
            );
            return DEFAULT_POLICY;
        }
    }

    /**
     * Broadcasts a signed transaction to the RPC. If the primary endpoint fails,
     * retries once using the Alchemy fallback RPC (if configured).
     */
    private async broadcastWithFallback(
        serializedTx: Buffer,
        latestBlockhash: { blockhash: string; lastValidBlockHeight: number }
    ): Promise<string> {
        try {
            const signature = await this.connection.sendRawTransaction(serializedTx);
            await this.connection.confirmTransaction({
                signature,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
            }, 'confirmed');
            return signature;
        } catch (primaryError: any) {
            if (!this.fallbackConnection) throw primaryError;

            Observability.logAction(this.config.agentId, 'RPC_FALLBACK', {
                reason: primaryError.message,
            });

            const signature = await this.fallbackConnection.sendRawTransaction(serializedTx);
            await this.fallbackConnection.confirmTransaction({
                signature,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
            }, 'confirmed');
            return signature;
        }
    }

    /**
     * Securely builds, validates, signs, and executes a generic sequence of instructions.
     * @param instructions The raw web3 instructions requested by the agent.
     */
    public async executeTransaction(instructions: TransactionInstruction[]): Promise<string> {
        try {
            // 1. Resolve the agent's policy (falls back to DEFAULT_POLICY if unregistered)
            const parsedPolicy = await this.resolvePolicy();

            // 2. Validate Instructions against the Policy
            this.policyEngine.validateInstructions(instructions, parsedPolicy);

            // 3. Load the Decrypted Wallet via Backend
            const signerKeypair = await this.walletManager.loadDecryptedWallet(this.config.agentId);

            // 4. Build and Sign the transaction
            const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
            const transaction = new Transaction({
                feePayer: signerKeypair.publicKey,
                recentBlockhash: latestBlockhash.blockhash,
            }).add(...instructions);

            transaction.sign(signerKeypair);

            // 5. Broadcast to RPC (with Alchemy fallback if primary fails)
            const signature = await this.broadcastWithFallback(
                transaction.serialize() as Buffer,
                latestBlockhash
            );

            Observability.logAction(this.config.agentId, 'TRANSACTION_SUCCESS', { signature });
            return signature;

        } catch (error: any) {
            Observability.logSecurityEvent(this.config.agentId, 'TRANSACTION_REJECTED', error.message);
            throw error;
        }
    }

    /**
     * Executes a native SOL transfer if allowed by policy.
     * @param toAddress Address of the receiver.
     * @param amountSol Number of SOL to send.
     */
    public async transferSol(toAddress: string, amountSol: number): Promise<string> {
        try {
            // Resolve policy (with DEFAULT_POLICY fallback)
            const policy = await this.resolvePolicy();

            // Fast fail on value violation
            this.policyEngine.validateTransferAmount(amountSol, policy);

            const signerPubkey = await this.getWalletAddress();
            const ix = this.builder.buildTransferSol(signerPubkey, new PublicKey(toAddress), amountSol);

            return await this.executeTransaction([ix]);
        } catch (error: any) {
            Observability.logSecurityEvent(this.config.agentId, 'SOL_TRANSFER_FAILED', error.message);
            throw error;
        }
    }

    /**
     * Retrieves the public key (wallet address) for the configured agent.
     */
    public async getWalletAddress(): Promise<PublicKey> {
        const keypair = await this.walletManager.loadDecryptedWallet(this.config.agentId);
        return keypair.publicKey;
    }
}
