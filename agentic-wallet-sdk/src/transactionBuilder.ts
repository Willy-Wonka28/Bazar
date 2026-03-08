import {
    Connection,
    Transaction,
    SystemProgram,
    PublicKey,
    LAMPORTS_PER_SOL,
    TransactionInstruction
} from '@solana/web3.js';

import {
    createTransferInstruction,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction
} from '@solana/spl-token';

/**
 * Transforms generic AI intent into strictly formatted Solana transaction instructions.
 */
export class TransactionBuilder {

    /**
     * Builds a native SOL transfer instruction.
     * @param fromPubkey The agent's wallet.
     * @param toPubkey The destination wallet.
     * @param amountSol The numeric amount of SOL.
     */
    public buildTransferSol(fromPubkey: PublicKey, toPubkey: PublicKey, amountSol: number): TransactionInstruction {
        const lamports = amountSol * LAMPORTS_PER_SOL;

        return SystemProgram.transfer({
            fromPubkey,
            toPubkey,
            lamports
        });
    }

    /**
     * Builds SPL Token transfer instructions, optionally including an ATA creation if necessary.
     * @param connection Web3 connection to verify ATA existence.
     * @param fromPubkey The agent's wallet.
     * @param toPubkey The destination wallet.
     * @param mintPubkey The SPL Mint address.
     * @param amount The raw token amount (accounting for decimals).
     * @returns Array of required instructions (potentially including ATA creation).
     */
    public async buildTransferSplToken(
        connection: Connection,
        fromPubkey: PublicKey,
        toPubkey: PublicKey,
        mintPubkey: PublicKey,
        amount: number
    ): Promise<TransactionInstruction[]> {
        const instructions: TransactionInstruction[] = [];

        // Derive Agent's Source ATA
        const fromAta = getAssociatedTokenAddressSync(mintPubkey, fromPubkey);

        // Derive Destination ATA
        const toAta = getAssociatedTokenAddressSync(mintPubkey, toPubkey);

        // Check if destination ATA exists
        const toAtaInfo = await connection.getAccountInfo(toAta);

        if (!toAtaInfo) {
            // Append instruction to create the ATA for the receiver if it doesn't exist
            instructions.push(
                createAssociatedTokenAccountInstruction(
                    fromPubkey, // Agent pays for ATA creation
                    toAta,
                    toPubkey,
                    mintPubkey
                )
            );
        }

        // Append the actual token transfer instruction
        instructions.push(
            createTransferInstruction(
                fromAta,
                toAta,
                fromPubkey,
                amount
            )
        );

        return instructions;
    }
}
