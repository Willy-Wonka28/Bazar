import { Keypair } from '@solana/web3.js';
import { SecureKeyStore } from './secureKeyStore';

/**
 * Handles programmatic generation and secure loading of AI Agent wallets.
 * Encrypted private keys are fetched from the Bazar Backend (never Supabase directly).
 * Raw keys only exist briefly in memory during signing.
 */
export class WalletManager {
    private readonly keystore: SecureKeyStore;
    private readonly backendUrl: string;

    /**
     * Initializes the Wallet Manager.
     * @param masterSecret The agent's unique encryption secret (from npx bazar init).
     * @param backendUrl The Bazar Backend URL (e.g., http://localhost:4000).
     */
    constructor(masterSecret: string, backendUrl: string) {
        this.keystore = new SecureKeyStore(masterSecret);
        this.backendUrl = backendUrl;
    }

    /**
     * Loads and decrypts an agent's wallet securely into memory for signing.
     * Fetches the encrypted key from the Bazar Backend (which reads from Supabase
     * with the service_role key). The decrypted key exists in memory only for signing.
     * @param agentId The UUID of the agent.
     * @returns The full Solana Keypair instance ready for signing.
     * @throws Error if the agent is not found or decryption fails.
     */
    public async loadDecryptedWallet(agentId: string): Promise<Keypair> {
        const res = await fetch(`${this.backendUrl}/api/agent/${agentId}`);
        const data = await res.json();

        if (!res.ok || !data.encrypted_private_key) {
            throw new Error(`Encrypted wallet not found for Agent ${agentId}. Has the agent been registered?`);
        }

        // Decrypt in memory
        const decryptedHex = this.keystore.decrypt(data.encrypted_private_key);

        // Reconstruct the Solana Keypair object
        const secretKey = Uint8Array.from(Buffer.from(decryptedHex, 'hex'));

        return Keypair.fromSecretKey(secretKey);
    }
}
