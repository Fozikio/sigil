import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BridgeNotification } from "@/hooks/useBridge";

interface Props {
  notifications: BridgeNotification[];
  onGesture: (messageId: string, action: string) => Promise<void>;
}

const typeBadge: Record<string, { label: string; className: string }> = {
  info: { label: "INFO", className: "bg-zinc-800 text-zinc-300 border-zinc-600" },
  success: { label: "OK", className: "bg-emerald-900 text-emerald-300 border-emerald-700" },
  warning: { label: "WARN", className: "bg-amber-900 text-amber-300 border-amber-700" },
  error: { label: "ERROR", className: "bg-red-900 text-red-300 border-red-700" },
  approval: { label: "APPROVE", className: "bg-blue-900 text-blue-300 border-blue-700" },
  command_result: { label: "CMD", className: "bg-purple-900 text-purple-300 border-purple-700" },
};

export function NotificationFeed({ notifications, onGesture }: Props) {
  if (notifications.length === 0) {
    return (
      <div className="flex-1 min-h-0 px-3 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">No notifications yet</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 min-h-0 px-3">
      <div className="flex flex-col gap-2 pb-2">
        {notifications.map((n, i) => {
          const badge = typeBadge[n.type] ?? typeBadge.info;
          const key = `${n.type}-${i}`;

          return (
            <Card key={key} className="py-2.5 px-3 gap-0">
              <CardContent className="p-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 font-mono ${badge.className}`}
                  >
                    {badge.label}
                  </Badge>
                  {n.project && (
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {n.project}
                    </span>
                  )}
                  {n.enriched?.session_cost_usd !== undefined && (
                    <span className="text-[11px] text-muted-foreground font-mono ml-auto">
                      ${n.enriched.session_cost_usd.toFixed(2)}
                    </span>
                  )}
                </div>

                {n.title && (
                  <p className="text-sm font-medium text-foreground">
                    {n.title}
                  </p>
                )}

                <p className="text-sm text-foreground/90 leading-snug">
                  {n.message}
                </p>

                {n.actions && n.actions.length > 0 && (
                  <div className="flex gap-1.5 pt-0.5">
                    {n.actions.map((action) => (
                      <Button
                        key={action.action}
                        variant="secondary"
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={() => onGesture(`notif-${i}`, action.action)}
                      >
                        {action.gesture} {action.label}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ScrollArea>
  );
}
