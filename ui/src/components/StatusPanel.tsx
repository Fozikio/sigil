import { Card, CardContent } from "@/components/ui/card";
import type { AgentSession } from "@/hooks/useBridge";

interface Props {
  sessions: AgentSession[];
}

const statusColor: Record<string, string> = {
  active: "bg-emerald-500",
  idle: "bg-blue-500",
  blocked: "bg-amber-500",
  completing: "bg-purple-500",
  stale: "bg-red-500",
};

export function StatusPanel({ sessions }: Props) {
  if (sessions.length === 0) {
    return (
      <div className="px-3 pt-3 pb-1">
        <Card className="py-2 px-3 gap-0">
          <CardContent className="p-0 text-sm text-muted-foreground">
            No active sessions
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-3 pt-3 pb-1">
      <div className="grid grid-cols-2 gap-2">
        {sessions.map((s) => {
          const elapsed = Math.floor(
            (Date.now() - new Date(s.started_at).getTime()) / 1000,
          );
          const mins = Math.floor(elapsed / 60);

          return (
            <Card key={s.session_id} className="py-2 px-3 gap-0">
              <CardContent className="p-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${statusColor[s.status] ?? "bg-zinc-500"}`}
                  />
                  <span className="text-sm font-medium text-foreground">
                    {s.project}
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground font-mono">
                    {mins}m
                  </span>
                </div>
                <div className="flex items-center gap-3 pl-4 text-[11px] text-muted-foreground font-mono">
                  <span>{s.tool_calls} calls</span>
                  <span>${s.cost_usd.toFixed(2)}</span>
                  <span className="ml-auto">{s.status}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
