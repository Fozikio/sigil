import { StatusPanel } from "@/components/StatusPanel";
import { NotificationFeed } from "@/components/NotificationFeed";
import { CommandPanel } from "@/components/CommandPanel";
import { useBridge } from "@/hooks/useBridge";

export default function App() {
  const bridge = useBridge();

  return (
    <div className="h-dvh flex flex-col bg-background text-foreground">
      <header className="px-3 pt-3 pb-1 flex items-center justify-between">
        <h1 className="text-sm font-mono font-semibold tracking-wide text-muted-foreground uppercase">
          Sigil
        </h1>
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            bridge.connected ? "bg-emerald-500" : "bg-red-500"
          }`}
          title={bridge.connected ? "Connected" : "Disconnected"}
        />
      </header>

      <StatusPanel
        sessions={bridge.sessions}
        services={bridge.services}
        cron={bridge.cron}
      />

      <NotificationFeed
        notifications={bridge.notifications}
        onGesture={bridge.sendGesture}
      />

      <CommandPanel
        commands={bridge.commands}
        onCommand={bridge.sendCommand}
      />
    </div>
  );
}
