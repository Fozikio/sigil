import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type NotificationType = "health" | "deploy" | "error" | "info" | "cron";

interface Notification {
  id: string;
  timestamp: string;
  type: NotificationType;
  message: string;
  actions?: string[];
}

const typeBadgeVariant: Record<
  NotificationType,
  { label: string; className: string }
> = {
  health: { label: "HEALTH", className: "bg-emerald-900 text-emerald-300 border-emerald-700" },
  deploy: { label: "DEPLOY", className: "bg-blue-900 text-blue-300 border-blue-700" },
  error: { label: "ERROR", className: "bg-red-900 text-red-300 border-red-700" },
  info: { label: "INFO", className: "bg-zinc-800 text-zinc-300 border-zinc-600" },
  cron: { label: "CRON", className: "bg-amber-900 text-amber-300 border-amber-700" },
};

const notifications: Notification[] = [
  {
    id: "1",
    timestamp: "12:04",
    type: "error",
    message: "Cortex health check failed — 503 on /api/health. Retrying in 60s.",
    actions: ["Retry Now", "Silence"],
  },
  {
    id: "2",
    timestamp: "11:30",
    type: "deploy",
    message: "idapixl-cortex v0.3.1 deployed to Cloud Run. All health checks passing.",
  },
  {
    id: "3",
    timestamp: "09:00",
    type: "cron",
    message: "PACO cron session completed. 3 commits, 1 thread resolved. Budget: $0.42/$1.00.",
    actions: ["View Log"],
  },
  {
    id: "4",
    timestamp: "08:15",
    type: "health",
    message: "All 4 services healthy. Uptime: 99.7% (7d).",
  },
  {
    id: "5",
    timestamp: "Yesterday",
    type: "info",
    message: "New cortex observation: retrieval-router accuracy improved to 91.2% after retraining.",
  },
];

export function NotificationFeed() {
  return (
    <ScrollArea className="flex-1 min-h-0 px-3">
      <div className="flex flex-col gap-2 pb-2">
        {notifications.map((n) => {
          const badge = typeBadgeVariant[n.type];
          return (
            <Card key={n.id} className="py-2.5 px-3 gap-0">
              <CardContent className="p-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 font-mono ${badge.className}`}
                  >
                    {badge.label}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground font-mono ml-auto">
                    {n.timestamp}
                  </span>
                </div>
                <p className="text-sm text-foreground/90 leading-snug">
                  {n.message}
                </p>
                {n.actions && (
                  <div className="flex gap-1.5 pt-0.5">
                    {n.actions.map((action) => (
                      <Button
                        key={action}
                        variant="secondary"
                        size="sm"
                        className="h-6 text-xs px-2"
                      >
                        {action}
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
