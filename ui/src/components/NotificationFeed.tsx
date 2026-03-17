import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { SigilMessage } from "@/hooks/useSigil";

interface Props {
  notifications: SigilMessage[];
  onGesture: (messageId: string, action: string) => Promise<void>;
}

const typeConfig: Record<string, { label: string; color: string; border: string; bg: string }> = {
  info:           { label: "INF", color: "text-[var(--sigil-info)]",     border: "border-l-[var(--sigil-info)]/50",     bg: "" },
  success:        { label: "OK",  color: "text-[var(--sigil-ok)]",       border: "border-l-[var(--sigil-ok)]",          bg: "bg-[var(--sigil-ok)]/[0.03]" },
  warning:        { label: "WRN", color: "text-[var(--sigil-warn)]",     border: "border-l-[var(--sigil-warn)]",        bg: "bg-[var(--sigil-warn)]/[0.03]" },
  error:          { label: "ERR", color: "text-[var(--sigil-error)]",    border: "border-l-[var(--sigil-error)]",       bg: "bg-[var(--sigil-error)]/[0.03]" },
  approval:       { label: "APR", color: "text-[var(--sigil-approval)]", border: "border-l-[var(--sigil-approval)]",    bg: "bg-[var(--sigil-approval)]/[0.05]" },
  command_result: { label: "CMD", color: "text-[var(--sigil-cmd)]",      border: "border-l-[var(--sigil-cmd)]/50",      bg: "" },
};

function formatTime(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatAge(unix: number): string {
  const sec = Math.floor(Date.now() / 1000) - unix;
  if (sec < 60) return "now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h`;
}

export function NotificationFeed({ notifications, onGesture }: Props) {
  if (notifications.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="text-center space-y-3 px-8">
          <div className="text-[11px] tracking-[0.25em] uppercase text-muted-foreground/40">
            Awaiting signals
          </div>
          <Separator className="mx-auto w-16 bg-border/30" />
          <div className="text-[11px] text-muted-foreground/25 leading-relaxed">
            Agents POST to <span className="text-muted-foreground/40">/publish</span>
            <br />Signals appear here in real time
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {notifications.map((n) => {
        const cfg = typeConfig[n.type] ?? typeConfig.info;
        const hasActions = n.actions && n.actions.length > 0;

        return (
          <div
            key={n.id}
            className={`sigil-slide-in border-l-2 ${cfg.border} border-b border-border/20 px-4 py-3 transition-colors hover:bg-[var(--sigil-surface-raised)] ${cfg.bg}`}
          >
            {/* Header: type indicator + timestamp + project */}
            <div className="flex items-center gap-2 text-[10px] mb-1">
              <span className={`font-semibold ${cfg.color}`} title={n.type}>
                {cfg.label}
              </span>

                <span className="text-muted-foreground/50 tabular-nums">
                  {formatTime(n.time)}
                </span>

                {n.project && (
                  <span className="text-muted-foreground/35 uppercase tracking-wider">
                    {n.project}
                  </span>
                )}

                <span className="ml-auto text-muted-foreground/25 tabular-nums text-[9px]">
                  {formatAge(n.time)}
                </span>
              </div>

              {/* Title */}
              {n.title && (
                <p className="text-[12px] font-medium text-foreground/90 leading-tight">
                  {n.title}
                </p>
              )}

              {/* Message body */}
              <p className="text-[12px] text-foreground/60 leading-snug mt-0.5">
                {n.message}
              </p>

              {/* Action buttons — prominent, tactile */}
              {hasActions && (
                <div className="flex gap-2 mt-2.5">
                  {n.actions!.map((action, i) => (
                    <Button
                      key={action.action}
                      variant={i === 0 ? "default" : "outline"}
                      size="sm"
                      className={`h-7 text-[11px] px-3 font-medium ${
                        i === 0
                          ? "bg-[var(--sigil-ok)]/15 text-[var(--sigil-ok)] border border-[var(--sigil-ok)]/30 hover:bg-[var(--sigil-ok)]/25"
                          : "border-border/40 text-muted-foreground hover:text-foreground"
                      } transition-all active:scale-[0.96]`}
                      onClick={() => onGesture(n.id, action.action)}
                    >
                      <span className="mr-1">{action.gesture}</span>
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
  );
}
