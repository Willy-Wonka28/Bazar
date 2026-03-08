import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { Keypair } from '@solana/web3.js';
import 'dotenv/config';

// ============================================================
// Supabase client
// ============================================================
const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================
// AES-256-GCM encryption (mirrors SecureKeyStore in the SDK)
// ============================================================
function encryptPrivateKey(secret: string, plaintext: string): string {
    const masterKey = crypto.createHash('sha256').update(secret).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag().toString('base64');
    const ivB64 = iv.toString('base64');

    return `${ivB64}:${authTag}:${encrypted}`;
}

// ============================================================
// Policy templates (hardcoded — the source of truth)
// ============================================================
const POLICY_TEMPLATES: Record<string, { name: string; rules: object }> = {
    trader: {
        name: 'Standard Trader',
        rules: {
            max_tx_amount: 1.5,
            max_tx_per_minute: 5,
            allowed_programs: ['11111111111111111111111111111111'],
        },
    },
    treasury: {
        name: 'Treasury Vault',
        rules: {
            max_tx_amount: 0.1,
            max_tx_per_minute: 1,
            allowed_programs: ['11111111111111111111111111111111'],
        },
    },
};

// ============================================================
// Express App
// ============================================================
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

/**
 * GET /api/policies
 * Returns the list of available agent roles and their policy rules.
 */
app.get('/api/policies', (_req, res) => {
    const roles = Object.entries(POLICY_TEMPLATES).map(([key, val]) => ({
        role: key,
        name: val.name,
        rules: val.rules,
    }));
    res.json({ policies: roles });
});

/**
 * GET /api/agent/:id
 * Returns an agent's encrypted private key and wallet address.
 * Agents call this at runtime to load their wallet for signing.
 */
app.get('/api/agent/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('agents')
            .select('id, name, wallet_address, policy_id, encrypted_private_key')
            .eq('id', req.params.id)
            .single();

        if (error || !data) {
            res.status(404).json({ error: `Agent not found: ${error?.message}` });
            return;
        }

        res.json(data);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/agent/:id/policy
 * Returns the policy rules assigned to a specific agent.
 * The SDK calls this to validate transactions before signing.
 */
app.get('/api/agent/:id/policy', async (req, res) => {
    try {
        // Look up the agent's policy_id
        const { data: agent, error: agentErr } = await supabase
            .from('agents')
            .select('policy_id')
            .eq('id', req.params.id)
            .single();

        if (agentErr || !agent) {
            res.status(404).json({ error: `Agent not found: ${agentErr?.message}` });
            return;
        }

        // Fetch the policy rules
        const { data: policy, error: policyErr } = await supabase
            .from('policies')
            .select('name, rules')
            .eq('id', agent.policy_id)
            .single();

        if (policyErr || !policy) {
            res.status(404).json({ error: `Policy not found: ${policyErr?.message}` });
            return;
        }

        res.json(policy);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/register
 * Registers a new agent: creates the policy (if needed), generates a wallet,
 * encrypts the private key, and inserts the agent record into Supabase.
 * 
 * Body: { name: string, role: "trader" | "treasury" }
 * Returns: { agentId, walletAddress, encryptionSecret, policyName }
 */
app.post('/api/register', async (req, res) => {
    try {
        const { name, role } = req.body;

        if (!name || !role) {
            res.status(400).json({ error: 'Missing required fields: name, role' });
            return;
        }

        const template = POLICY_TEMPLATES[role];
        if (!template) {
            res.status(400).json({ error: `Invalid role "${role}". Available: ${Object.keys(POLICY_TEMPLATES).join(', ')}` });
            return;
        }

        // 1. Find or create the policy
        let policyId: string;
        const { data: existingPolicy } = await supabase
            .from('policies')
            .select('id')
            .eq('name', template.name)
            .single();

        if (existingPolicy) {
            policyId = existingPolicy.id;
        } else {
            const { data: newPolicy, error: policyErr } = await supabase
                .from('policies')
                .insert({ name: template.name, rules: template.rules })
                .select()
                .single();

            if (policyErr || !newPolicy) {
                res.status(500).json({ error: `Failed to create policy: ${policyErr?.message}` });
                return;
            }
            policyId = newPolicy.id;
        }

        // 2. Generate a unique encryption secret for this agent
        const encryptionSecret = crypto.randomBytes(16).toString('hex');

        // 3. Generate Solana keypair
        const keypair = Keypair.generate();
        const walletAddress = keypair.publicKey.toBase58();

        // 4. Encrypt the private key with the agent's unique secret
        const encryptedKey = encryptPrivateKey(
            encryptionSecret,
            Buffer.from(keypair.secretKey).toString('hex')
        );

        // 5. Insert agent record into Supabase
        const { data: agent, error: agentErr } = await supabase
            .from('agents')
            .insert({
                name,
                wallet_address: walletAddress,
                policy_id: policyId,
                encrypted_private_key: encryptedKey,
            })
            .select()
            .single();

        if (agentErr || !agent) {
            res.status(500).json({ error: `Failed to register agent: ${agentErr?.message}` });
            return;
        }

        // 6. Return credentials to the agent
        res.json({
            agentId: agent.id,
            walletAddress,
            encryptionSecret,
            policyName: template.name,
        });

    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// Start
// ============================================================
app.listen(PORT, () => {
    console.log(`\n  Bazar Backend running on http://localhost:${PORT}`);
    console.log(`  Endpoints:`);
    console.log(`    GET  /api/policies`);
    console.log(`    GET  /api/agent/:id`);
    console.log(`    GET  /api/agent/:id/policy`);
    console.log(`    POST /api/register\n`);
});
