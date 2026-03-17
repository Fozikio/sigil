import { Button } from "@/components/ui/button";
import type { SigilMessage } from "@/hooks/useSigil";

interface Props {
  notifications: SigilMessage[];
  onGesture: (messageId: string, action: string) => Promise<void>;
}

const typeIndicator: Record<string, { label: string; color: string; border: string }> = {
  info:           { label: "INF", color: "text-[var(--sigil-info)]",     border: "border-l-[var(--sigil-info)]" },
  success:        { label: "OK ",  color: "text-[var(--sigil-ok)]",       border: "border-l-[var(--sigil-ok)]" },
  warning:        { label: "WRN", color: "text-[var(--sigil-warn)]",     border: "border-l-[var(--sigil-warn)]" },
  error:          { label: "ERR", color: "text-[var(--sigil-error)]",    border: "border-l-[var(--sigil-error)]" },
  approval:       { label: "APR", color: "text-[var(--sigil-approval)]", border: "border-l-[var(--sigil-approval)]" },
  command_result: { label: "CMD", color: "text-[var(--sigil-cmd)]",      border: "border-l-[var(--sigil-cmd)]" },
};

function formatTime(unix: number): string {
  const d = new Date(unix * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
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
        <div className="text-center space-y-2">
          <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50">
            Awaiting signals
          </div>
          <div className="text-[10px] text-muted-foreground/30">
            Agents publish to /publish. Signals appear here.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {notifications.map((n) => {
        const indicator = typeIndicator[n.type] ?? typeIndicator.info;

        return (
          <div
            key={n.id}
            className={`sigil-slide-in border-l-2 ${indicator.border} border-b border-border/30 px-4 py-2.5 hover:bg-[var(--sigil-surface-raised)] transition-colors`}
          >
            {/* Top line: type + time + project */}
            <div className="flex items-center gap-2 text-[10px]">
              <span className={`font-semibold ${indicator.color}`}>
                {indicator.label}
              </span>
              <span className="text-muted-foreground/60 tabular-nums">
                {formatTime(n.time)}
              </span>
              {n.project && (
                <span className="text-muted-foreground/40">
                  {n.project}
                </span>
              )}
              <span className="ml-auto text-muted-foreground/30 tabular-nums">
                {formatAge(n.time)}
              </span>
            </div>

            {/* Title (if present) */}
            {n.title && (
              <p className="text-[12px] font-medium text-foreground mt-1 leading-tight">
                {n.title}
              </p>
            )}

            {/* Message body */}
            <p className="text-[12px] text-foreground/75 mt-0.5 leading-snug">
              {n.message}
            </p>

            {/* Gesture action buttons */}
            {n.actions && n.actions.length > 0 && (
              <div className="flex gap-1.5 mt-2">
                {n.actions.map((action) => (
                  <Button
                    key={action.action}
                    variant="outline"
                    size="sm"
                    className="h-6 text-[11px] px-2.5 border-border/50 hover:border-[var(--sigil-ok)] hover:text-[var(--sigil-ok)] transition-colors"
                    onClick={() => onGesture(n.id, action.action)}
                  >
                    {action.gesture} {action.label}
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
