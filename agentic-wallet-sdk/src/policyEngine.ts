import { z } from 'zod';
import { TransactionInstruction } from '@solana/web3.js';

/**
 * Definition of an Agent's Policy Schema.
 * This dictates what limits or constraints apply to the agent's actions.
 */
export const PolicySchema = z.object({
    /** Maximum amount of SOL or Tokens allowed per transaction */
    max_tx_amount: z.number().positive().optional(),

    /** Maximum number of transactions the agent can perform per minute (currently illustrative) */
    max_tx_per_minute: z.number().int().positive().optional(),

    /** List of public keys (as strings) for Solana Programs the agent is allowed to interact with */
    allowed_programs: z.array(z.string()).optional()
});

export type AgentPolicy = z.infer<typeof PolicySchema>;

/**
 * Default fallback policy applied to any agent that is not explicitly registered
 * or has no policy configured. Falls back to Standard Trader limits so agents
 * remain functional while still being constrained.
 */
export const DEFAULT_POLICY: AgentPolicy = {
    max_tx_amount: 1.5,
    max_tx_per_minute: 5,
    allowed_programs: ['11111111111111111111111111111111'] // Native System Program only
};

/**
 * The Policy Engine enforces the AI agent's constraints.
 * It intercepts requested transactions and ensures they comply with the registered agent's policy.
 */
export class PolicyEngine {

    /**
     * Parses and validates raw JSON rules into a strongly-typed format.
     * @param rules The raw JSON rules fetched from storage (e.g. Supabase).
     * @returns A validated AgentPolicy object.
     * @throws ZodError if the raw rules do not match the expected schema.
     */
    public parsePolicy(rules: any): AgentPolicy {
        return PolicySchema.parse(rules);
    }

    /**
     * Validates a generic transfer amount against the policy limit.
     * @param amount The requested transfer amount.
     * @param policy The agent's strict policy definition.
     * @throws Error if the amount exceeds the maximum allowed.
     */
    public validateTransferAmount(amount: number, policy: AgentPolicy): void {
        if (policy.max_tx_amount && amount > policy.max_tx_amount) {
            throw new Error(`Policy Violation: Requested transfer of ${amount} exceeds the allowed limit of ${policy.max_tx_amount}`);
        }
    }

    /**
     * Validates that all instructions in a planned transaction target allowed programs.
     * @param instructions Array of transaction instructions.
     * @param policy The agent's strict policy definition.
     * @throws Error if an instruction interacts with a non-whitelisted program.
     */
    public validateInstructions(instructions: TransactionInstruction[], policy: AgentPolicy): void {
        if (!policy.allowed_programs || policy.allowed_programs.length === 0) {
            // If there are no policies set up for the agent, the agent will be allowed to interact with any program.
            return;
        }

        const allowedSet = new Set(policy.allowed_programs);

        for (const ix of instructions) {
            const programId = ix.programId.toBase58();
            if (!allowedSet.has(programId)) {
                throw new Error(`Policy Violation: Agent is not allowed to interact with program ${programId}`);
            }
        }
    }
}
