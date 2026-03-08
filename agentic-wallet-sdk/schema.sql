-- Supabase Database Schema for Agentic Wallet Runtime
-- This file defines the central tables and Row Level Security (RLS) policies.

-- 1. Policies Table
-- Stores the JSON-formatted Zod rules defining what an agent can and cannot do.
CREATE TABLE policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    rules JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Agents Table
-- Registers unique agents, binds them to a Solana wallet address, and assigns a policy.
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    wallet_address TEXT NOT NULL UNIQUE,
    policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE RESTRICT,
    encrypted_private_key TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ==========================================
-- ROW LEVEL SECURITY (RLS) CONFIGURATION
-- ==========================================

-- Enable RLS on both tables
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- 1. Agents can only SELECT (read) records using the public anon key.
-- Agents should never be able to INSERT, UPDATE, or DELETE their own policies.
CREATE POLICY "Allow public read access to policies" 
ON policies FOR SELECT 
TO public 
USING (true);

-- Agents table: NO public SELECT. All reads go through the Bazar Backend
-- using the service_role key. This prevents agents from seeing each other's
-- encrypted keys, wallet addresses, or policy assignments.

-- 2. Restrict INSERT/UPDATE/DELETE to authenticated Service Roles or Admins only.
-- (This ensures agents, who only have the anon key, cannot modify the registry)
CREATE POLICY "Allow service role full access to policies" 
ON policies FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow service role full access to agents" 
ON agents FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);
