import { Card, CardContent } from "@/components/ui/card";
import type { AgentSession, ServiceHealth, CronTimerStatus } from "@/hooks/useBridge";

interface Props {
  sessions: AgentSession[];
  services: ServiceHealth[];
  cron: CronTimerStatus;
}

const serviceStatusDot: Record<string, string> = {
  ok: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
  unknown: "bg-zinc-500",
};

const sessionStatusDot: Record<string, string> = {
  active: "bg-emerald-500",
  idle: "bg-blue-500",
  blocked: "bg-amber-500",
  completing: "bg-purple-500",
  stale: "bg-red-500",
};

const cronStatusDot: Record<string, string> = {
  active: "bg-emerald-500",
  idle: "bg-zinc-400",
  disabled: "bg-zinc-600",
  unknown: "bg-zinc-500",
};

function formatAge(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h ago`;
}

function formatNextFire(raw?: string): string {
  if (!raw) return "";
  // systemd returns formats like "Sat 2026-03-14 01:43:33 UTC"
  try {
    const target = new Date(raw);
    const ms = target.getTime() - Date.now();
    if (ms <= 0) return "now";
    const min = Math.floor(ms / 60000);
    if (min < 60) return `${min}m`;
    const hrs = Math.floor(min / 60);
    const rem = min % 60;
    return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
  } catch {
    return "";
  }
}

export function StatusPanel({ sessions, services, cron }: Props) {
  const hasServices = services.length > 0 || cron.status !== "unknown";
  const hasSessions = sessions.length > 0;

  return (
    <div className="px-3 pt-3 pb-1 space-y-2">
      {/* Services strip */}
      {hasServices && (
        <Card className="py-2 px-3 gap-0">
          <CardContent className="p-0 space-y-1">
            {services.map((s) => (
              <div key={s.name} className="flex items-center gap-2 text-[11px] font-mono">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${serviceStatusDot[s.status] ?? "bg-zinc-500"}`}
                />
                <span className="text-foreground w-16">{s.name}</span>
                <span className="text-muted-foreground w-12 text-right">
                  {s.status === "ok" || s.status === "degraded"
                    ? `${s.response_ms}ms`
                    : s.status}
                </span>
                <span className="text-muted-foreground ml-auto">
                  {formatAge(s.last_check)}
                </span>
              </div>
            ))}
            {/* Cron timer */}
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${cronStatusDot[cron.status] ?? "bg-zinc-500"}`}
              />
              <span className="text-foreground w-16">cron</span>
              <span className="text-muted-foreground w-12 text-right">
                {cron.status}
              </span>
              <span className="text-muted-foreground ml-auto">
                {cron.status === "active" || cron.status === "idle"
                  ? `next: ${formatNextFire(cron.next_fire)}`
                  : ""}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active sessions */}
      {hasSessions && (
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
                      className={`inline-block h-2 w-2 rounded-full ${sessionStatusDot[s.status] ?? "bg-zinc-500"}`}
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
                    {s.model && <span>{s.model}</span>}
                    <span className="ml-auto">
                      {s.billing !== "unknown" ? s.billing : s.status}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!hasServices && !hasSessions && (
        <Card className="py-2 px-3 gap-0">
          <CardContent className="p-0 text-sm text-muted-foreground">
            No services or sessions
          </CardContent>
        </Card>
      )}
    </div>
  );
}
