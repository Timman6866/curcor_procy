import type { SDKAgent } from "@cursor/sdk";

export interface AgentSession {
  agent: SDKAgent;
  apiKey: string;
  model: string;
}

export class AgentSessionStore {
  private readonly sessions = new Map<string, AgentSession>();

  set(agentId: string, session: AgentSession) {
    this.sessions.set(agentId, session);
  }

  get(agentId: string): AgentSession | undefined {
    return this.sessions.get(agentId);
  }

  async close(agentId: string): Promise<boolean> {
    const session = this.sessions.get(agentId);
    if (!session) return false;
    this.sessions.delete(agentId);
    await session.agent.close();
    return true;
  }
}
