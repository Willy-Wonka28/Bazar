// this file will log multiple actions of the ai agent...helps with observability

export class Observability {
    /**
     * Records a significant action performed by an agent.
     * @param agentId The UUID of the agent.
     * @param action The type of action (e.g., "TRANSFER_SOL", "POLICY_VIOLATION").
     * @param details Any auxiliary data to attach (e.g., {"amount": 1, "to": "..."}).
     */

    public static logAction(agentId: string, action: string, details: Record<string, any> = {}): void {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: 'INFO',
            agentId,
            action,
            ...details
        };
        console.log(`[AGENT-LOG] ${JSON.stringify(logEntry)}`);
    }

    /**
     * Records a security violation or critical error.
     */
    public static logSecurityEvent(agentId: string, action: string, reason: string): void {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: 'WARN',
            agentId,
            action,
            reason
        };
        console.error(`[SECURITY-EVENT] ${JSON.stringify(logEntry)}`);
    }
}
