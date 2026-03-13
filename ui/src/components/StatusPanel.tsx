import { Card, CardContent } from "@/components/ui/card";

type ServiceStatus = "healthy" | "disabled" | "down";

interface Service {
  name: string;
  status: ServiceStatus;
  latency?: string;
}

const services: Service[] = [
  { name: "Cortex", status: "healthy", latency: "14ms" },
  { name: "Site", status: "healthy", latency: "120ms" },
  { name: "Cron", status: "disabled" },
  { name: "Webhook", status: "healthy", latency: "8ms" },
];

const statusColor: Record<ServiceStatus, string> = {
  healthy: "bg-emerald-500",
  disabled: "bg-zinc-500",
  down: "bg-red-500",
};

export function StatusPanel() {
  return (
    <div className="px-3 pt-3 pb-1">
      <div className="grid grid-cols-2 gap-2">
        {services.map((s) => (
          <Card key={s.name} className="py-2 px-3 gap-0">
            <CardContent className="p-0 flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${statusColor[s.status]}`}
              />
              <span className="text-sm font-medium text-foreground">
                {s.name}
              </span>
              {s.latency && (
                <span className="ml-auto text-xs text-muted-foreground font-mono">
                  {s.latency}
                </span>
              )}
              {!s.latency && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {s.status}
                </span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
