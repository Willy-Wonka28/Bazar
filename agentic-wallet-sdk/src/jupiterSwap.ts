import { PublicKey, VersionedTransaction } from '@solana/web3.js';

// ============================================================
// Token mint addresses (Devnet)
// ============================================================
export const DEVNET_MINTS = {
    SOL:  'So11111111111111111111111111111111111111112',  // Wrapped SOL
    USDC: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // Circle Devnet USDC
};

export const JUPITER_API = 'https://api.jup.ag/v6';

/**
 * The quote returned by Jupiter for a given swap route.
 */
export interface JupiterQuote {
    inputMint: string;
    inAmount: string;
    outputMint: string;
    outAmount: string;
    otherAmountThreshold: string;
    swapMode: string;
    slippageBps: number;
    priceImpactPct: string;
    routePlan: any[];
}

/**
 * Fetches the best swap quote from Jupiter for a given input/output mint pair.
 * @param inputMint  Input token mint address (e.g., Wrapped SOL).
 * @param outputMint Output token mint address (e.g., Devnet USDC).
 * @param amountLamports Amount in the smallest unit of the input token (lamports for SOL).
 * @param slippageBps Slippage tolerance in basis points (default: 50 = 0.5%).
 */
export async function getJupiterQuote(
    inputMint: string,
    outputMint: string,
    amountLamports: number,
    slippageBps = 50
): Promise<JupiterQuote> {
    const url = new URL(`${JUPITER_API}/quote`);
    url.searchParams.set('inputMint', inputMint);
    url.searchParams.set('outputMint', outputMint);
    url.searchParams.set('amount', amountLamports.toString());
    url.searchParams.set('slippageBps', slippageBps.toString());

    const res = await fetch(url.toString());
    const data = await res.json();

    if (!res.ok || data.error) {
        throw new Error(`Jupiter quote failed: ${data.error || res.statusText}`);
    }

    return data as JupiterQuote;
}

/**
 * Fetches the swap transaction from Jupiter for a given quote.
 * Jupiter returns a base64-encoded VersionedTransaction ready to be signed and broadcast.
 *
 * @param quoteResponse The quote object returned by getJupiterQuote.
 * @param userPublicKey The agent's wallet public key (as a PublicKey instance).
 * @returns A VersionedTransaction ready for signing.
 */
export async function getJupiterSwapTransaction(
    quoteResponse: JupiterQuote,
    userPublicKey: PublicKey
): Promise<VersionedTransaction> {
    const res = await fetch(`${JUPITER_API}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            quoteResponse,
            userPublicKey: userPublicKey.toBase58(),
            wrapAndUnwrapSol: true, // Automatically wraps/unwraps native SOL
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: 'auto',
        }),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
        throw new Error(`Jupiter swap transaction failed: ${data.error || res.statusText}`);
    }

    // Deserialize the base64-encoded VersionedTransaction
    const swapTransactionBuf = Buffer.from(data.swapTransaction, 'base64');
    return VersionedTransaction.deserialize(swapTransactionBuf);
}

/**
 * Extracts all unique program IDs referenced by instructions in a VersionedTransaction.
 * Used by the PolicyEngine to validate programs before signing.
 */
export function extractProgramIds(tx: VersionedTransaction): string[] {
    const { staticAccountKeys } = tx.message;
    const programIds = new Set<string>();

    for (const ix of tx.message.compiledInstructions) {
        const programId = staticAccountKeys[ix.programIdIndex];
        if (programId) {
            programIds.add(programId.toBase58());
        }
    }

    return Array.from(programIds);
}
