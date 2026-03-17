import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { SigilMessage } from "@/hooks/useSigil";

interface Props {
  notifications: SigilMessage[];
  onGesture: (messageId: string, action: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
}

const typeConfig: Record<string, { label: string; color: string; border: string; bg: string }> = {
  info:           { label: "INF", color: "text-[var(--sigil-info)]",     border: "border-l-[var(--sigil-info)]/40",     bg: "" },
  success:        { label: "OK",  color: "text-[var(--sigil-ok)]",       border: "border-l-[var(--sigil-ok)]",          bg: "bg-[var(--sigil-ok)]/[0.02]" },
  warning:        { label: "WRN", color: "text-[var(--sigil-warn)]",     border: "border-l-[var(--sigil-warn)]",        bg: "bg-[var(--sigil-warn)]/[0.03]" },
  error:          { label: "ERR", color: "text-[var(--sigil-error)]",    border: "border-l-[var(--sigil-error)]",       bg: "bg-[var(--sigil-error)]/[0.04]" },
  approval:       { label: "APR", color: "text-[var(--sigil-approval)]", border: "border-l-[var(--sigil-approval)]",    bg: "bg-[var(--sigil-approval)]/[0.04]" },
  command_result: { label: "CMD", color: "text-[var(--sigil-cmd)]",      border: "border-l-[var(--sigil-cmd)]/40",      bg: "" },
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

export function NotificationFeed({ notifications, onGesture, onDismiss }: Props) {
  if (notifications.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="text-center space-y-3 px-8">
          <div className="text-2xl opacity-10">◇</div>
          <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/30">
            Awaiting signals
          </div>
          <Separator className="mx-auto w-12 bg-border/20" />
          <div className="text-[10px] text-muted-foreground/20 leading-relaxed max-w-[200px]">
            Agents publish to <span className="text-muted-foreground/30">/publish</span>.
            Signals appear here in real time.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {notifications.map((n, i) => {
        const cfg = typeConfig[n.type] ?? typeConfig.info;
        const hasActions = n.actions && n.actions.length > 0;
        const isFirst = i === 0;

        return (
          <div
            key={n.id}
            className={`sigil-slide-in border-l-2 ${cfg.border} ${cfg.bg} border-b border-border/15 group`}
          >
            <div className="px-4 py-2.5">
              {/* Header row */}
              <div className="flex items-center gap-1.5 text-[10px] mb-1">
                <span className={`font-semibold w-[28px] ${cfg.color}`}>
                  {cfg.label}
                </span>
                <span className="text-muted-foreground/40 tabular-nums">
                  {formatTime(n.time)}
                </span>
                {n.project && (
                  <span className="text-muted-foreground/25 uppercase tracking-wider text-[9px]">
                    {n.project}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1.5">
                  <span className="text-muted-foreground/20 tabular-nums text-[9px]">
                    {formatAge(n.time)}
                  </span>
                  <button
                    onClick={() => onDismiss(n.id)}
                    className="text-muted-foreground/0 group-hover:text-muted-foreground/40 hover:!text-muted-foreground/70 transition-all text-[11px] w-4 text-center"
                  >
                    ×
                  </button>
                </span>
              </div>

              {/* Title + message */}
              {n.title && (
                <p className={`text-[12px] font-medium leading-tight ${isFirst ? 'text-foreground' : 'text-foreground/80'}`}>
                  {n.title}
                </p>
              )}
              <p className={`text-[11px] leading-snug mt-0.5 ${isFirst ? 'text-foreground/70' : 'text-foreground/50'}`}>
                {n.message.replace(/^"|"$/g, '')}
              </p>

              {/* Action buttons */}
              {hasActions && (
                <div className="flex gap-1.5 mt-2">
                  {n.actions!.map((action, j) => (
                    <Button
                      key={action.action}
                      variant={j === 0 ? "default" : "outline"}
                      size="sm"
                      className={`h-7 text-[11px] px-3 font-medium transition-all active:scale-[0.96] ${
                        j === 0
                          ? "bg-[var(--sigil-ok)]/15 text-[var(--sigil-ok)] border border-[var(--sigil-ok)]/30 hover:bg-[var(--sigil-ok)]/25 hover:border-[var(--sigil-ok)]/50"
                          : "border-border/30 text-muted-foreground/60 hover:text-foreground/80 hover:border-border/60"
                      }`}
                      onClick={() => onGesture(n.id, action.action)}
                    >
                      <span className="mr-1">{action.gesture}</span>
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
