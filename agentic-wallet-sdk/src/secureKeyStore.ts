import * as crypto from 'crypto';

/**
 * The SecureKeyStore handles the encryption and decryption of private keys using AES-256-GCM.
 * This ensures that private keys are never stored in plaintext within the environment.
 */
export class SecureKeyStore {
    private readonly algorithm = 'aes-256-gcm';
    /**
     * Master password or key used to derive the actual encryption key.
     * In a real TEE (Trusted Execution Environment) this would be securely injected.
     */
    private readonly masterKey: Buffer;

    /**
     * Initializes the keystore with a provided secret.
     * @param secret - A strong master secret phrase.
     */
    constructor(secret: string) {
        // Derive a 32-byte key from the secret for AES-256
        this.masterKey = crypto.createHash('sha256').update(secret).digest();
    }

    /**
     * Encrypts a raw private key string.
     * @param plaintextKey - The raw private key (e.g. base58 or hex string)
     * @returns A base64-encoded string containing the iv, auth tag, and encrypted data, delimited by a colon.
     */
    public encrypt(plaintextKey: string): string {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.algorithm, this.masterKey, iv);

        let encrypted = cipher.update(plaintextKey, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        const authTag = cipher.getAuthTag().toString('base64');
        const ivHex = iv.toString('base64');

        return `${ivHex}:${authTag}:${encrypted}`;
    }

    /**
     * Decrypts an encrypted private key string back to its original form.
     * @param encryptedPackage - The base64-encoded package produced by the encrypt function.
     * @returns The plaintext private key.
     */
    public decrypt(encryptedPackage: string): string {
        const parts = encryptedPackage.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid encrypted package format. Expected IV:AuthTag:Data');
        }

        const iv = Buffer.from(parts[0], 'base64');
        const authTag = Buffer.from(parts[1], 'base64');
        const encryptedText = parts[2];

        const decipher = crypto.createDecipheriv(this.algorithm, this.masterKey, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }
}
