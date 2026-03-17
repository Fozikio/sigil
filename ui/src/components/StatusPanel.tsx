import type { AgentSession } from "@/hooks/useSigil";

interface Props {
  sessions: AgentSession[];
}

const statusColor: Record<string, string> = {
  active: "bg-[var(--sigil-ok)]",
  idle: "bg-[var(--sigil-info)]",
  blocked: "bg-[var(--sigil-warn)]",
  completing: "bg-[var(--sigil-cmd)]",
  stale: "bg-[var(--sigil-error)]",
};

const statusGlow: Record<string, string> = {
  active: "sigil-glow-ok",
  blocked: "sigil-glow-warn",
  stale: "sigil-glow-error",
};

function formatElapsed(startedAt: number): string {
  const sec = Math.floor(Date.now() / 1000) - startedAt;
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  const rem = min % 60;
  return rem > 0 ? `${hrs}h${rem}m` : `${hrs}h`;
}

export function StatusPanel({ sessions }: Props) {
  if (sessions.length === 0) return null;

  return (
    <div className="border-b border-border/50">
      {sessions.map((s) => (
        <div
          key={s.session_id}
          className="flex items-center gap-3 px-4 py-2 text-[11px] hover:bg-[var(--sigil-surface-raised)] transition-colors"
        >
          {/* Status indicator */}
          <div className={`h-2 w-2 rounded-full ${statusColor[s.status] ?? "bg-zinc-600"} ${
            s.status === "active" ? "sigil-pulse" : ""
          } ${statusGlow[s.status] ?? ""}`} />

          {/* Project name */}
          <span className="font-medium text-foreground min-w-[60px]">
            {s.project || "session"}
          </span>

          {/* Stats */}
          <span className="text-muted-foreground">{s.tool_calls} calls</span>
          {s.model && (
            <span className="text-muted-foreground hidden sm:inline">{s.model}</span>
          )}

          {/* Elapsed time — right aligned */}
          <span className="ml-auto text-muted-foreground tabular-nums">
            {formatElapsed(s.started_at)}
          </span>
        </div>
      ))}
    </div>
  );
}
