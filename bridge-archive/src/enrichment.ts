import type { AgentMessage, AgentSession } from './types.js';

export interface EnrichedMessage extends AgentMessage {
  enriched: {
    project_label?: string;
    session_duration_seconds?: number;
    session_billing?: string;
    session_model?: string;
    session_tool_calls?: number;
  };
}

/**
 * Enriches an agent message with project context, session duration, and cost data.
 */
export function enrichMessage(
  message: AgentMessage,
  sessions: Map<string, AgentSession>,
): EnrichedMessage {
  const enriched: EnrichedMessage = {
    ...message,
    enriched: {},
  };

  const sessionId = message.session_id;
  if (sessionId) {
    const session = sessions.get(sessionId);
    if (session) {
      const durationMs = Date.now() - session.started_at.getTime();
      enriched.enriched.session_duration_seconds = Math.floor(durationMs / 1000);
      enriched.enriched.session_billing = session.billing;
      enriched.enriched.session_model = session.model;
      enriched.enriched.session_tool_calls = session.tool_calls;
    }
  }

  if (message.project) {
    enriched.enriched.project_label = message.project;
  }

  return enriched;
}
