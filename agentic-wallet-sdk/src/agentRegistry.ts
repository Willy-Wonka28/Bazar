import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AgentPolicy } from './policyEngine';

// The structure of an agent in the Supabase db
 
export interface RegisteredAgent {
    id: string;
    name: string;
    wallet_address: string;
    policy_id: string;
    created_at: string;
}

// The structure of a policy map in the Supabase db

export interface PolicyRecord {
    id: string;
    name: string;
    rules: AgentPolicy;
}

/**
 * AgentRegistry connects to a durable data store (Supabase) to strictly map agents
 * to their approved wallets and associated policies. This enforces isolation boundaries.
 */

export class AgentRegistry {
    private readonly supabase: SupabaseClient;

    /**
     * Initializes the Agent Registry with a connection to the Supabase backend.
     * @param supabaseUrl The external URL of the Supabase project.
     * @param supabaseKey The Supabase API key (service_role or anon depending on context).
     */
    constructor(supabaseUrl: string, supabaseKey: string) {
        this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    /**
     * Registers a newly generated wallet for a specific agent name.
     * @param name The descriptive name of the agent (e.g. "Trader")
     * @param walletAddress The generated Solana public key.
     * @param policyId The ID of the policy they are bound to.
     * @returns The registered agent record retrieved from the database.
     */
    public async registerAgent(name: string, walletAddress: string, policyId: string): Promise<RegisteredAgent> {
        const { data, error } = await this.supabase
            .from('agents')
            .insert({ name, wallet_address: walletAddress, policy_id: policyId })
            .select()
            .single();

        if (error || !data) {
            throw new Error(`Failed to register agent: ${error?.message}`);
        }

        return data as RegisteredAgent;
    }

    /**
     * Retrieves an agent record by their associated wallet address.
     * @param walletAddress The agent's public key.
     * @returns The basic agent details tying them back to a specific policy.
     */
    public async getAgentByWallet(walletAddress: string): Promise<RegisteredAgent> {
        const { data, error } = await this.supabase
            .from('agents')
            .select('*')
            .eq('wallet_address', walletAddress)
            .single();

        if (error || !data) {
            throw new Error(`Agent not found for wallet ${walletAddress}: ${error?.message}`);
        }

        return data as RegisteredAgent;
    }

    /**
     * Resolves an agent's associated policy rules from the database.
     * @param agent The agent object fetched from the registry.
     * @returns The raw JSON rules to be passed into the PolicyEngine.
     */
    public async getAgentPolicyRules(agent: RegisteredAgent): Promise<AgentPolicy> {
        const { data, error } = await this.supabase
            .from('policies')
            .select('rules')
            .eq('id', agent.policy_id)
            .single();

        if (error || !data) {
            throw new Error(`Failed to map policy rules for agent ${agent.name}: ${error?.message}`);
        }

        return data.rules as AgentPolicy;
    }
}
