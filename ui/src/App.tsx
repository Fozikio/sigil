import { StatusPanel } from "@/components/StatusPanel";
import { NotificationFeed } from "@/components/NotificationFeed";
import { CommandPanel } from "@/components/CommandPanel";
import { useSigil } from "@/hooks/useSigil";

export default function App() {
  const sigil = useSigil();

  return (
    <div className="h-dvh flex flex-col bg-background text-foreground">
      <header className="px-3 pt-3 pb-1 flex items-center justify-between">
        <h1 className="text-sm font-mono font-semibold tracking-wide text-muted-foreground uppercase">
          Sigil
        </h1>
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            sigil.connected ? "bg-emerald-500" : "bg-red-500"
          }`}
          title={sigil.connected ? "Connected" : "Disconnected"}
        />
      </header>

      <StatusPanel sessions={sigil.sessions} />

      <NotificationFeed
        notifications={sigil.notifications}
        onGesture={sigil.sendGesture}
      />

      <CommandPanel
        commands={sigil.commands}
        onCommand={sigil.sendCommand}
      />
    </div>
  );
}
