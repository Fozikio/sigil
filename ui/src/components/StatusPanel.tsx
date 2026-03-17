import { Card, CardContent } from "@/components/ui/card";
import type { AgentSession } from "@/hooks/useSigil";

interface Props {
  sessions: AgentSession[];
}

const statusDot: Record<string, string> = {
  active: "bg-emerald-500",
  idle: "bg-blue-500",
  blocked: "bg-amber-500",
  completing: "bg-purple-500",
  stale: "bg-red-500",
};

function formatElapsed(startedAt: number): string {
  const sec = Math.floor(Date.now() / 1000) - startedAt;
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  const rem = min % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

export function StatusPanel({ sessions }: Props) {
  if (sessions.length === 0) return null;

  return (
    <div className="px-3 pt-2 pb-1">
      <div className="grid grid-cols-2 gap-2">
        {sessions.map((s) => (
          <Card key={s.session_id} className="py-2 px-3 gap-0">
            <CardContent className="p-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${statusDot[s.status] ?? "bg-zinc-500"}`}
                />
                <span className="text-sm font-medium text-foreground">
                  {s.project || "session"}
                </span>
                <span className="ml-auto text-[11px] text-muted-foreground font-mono">
                  {formatElapsed(s.started_at)}
                </span>
              </div>
              <div className="flex items-center gap-3 pl-4 text-[11px] text-muted-foreground font-mono">
                <span>{s.tool_calls} calls</span>
                {s.model && <span>{s.model}</span>}
                <span className="ml-auto">{s.status}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
