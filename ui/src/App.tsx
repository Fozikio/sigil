import { StatusPanel } from "@/components/StatusPanel";
import { NotificationFeed } from "@/components/NotificationFeed";
import { CommandPanel } from "@/components/CommandPanel";

export default function App() {
  return (
    <div className="h-dvh flex flex-col bg-background text-foreground">
      <header className="px-3 pt-3 pb-1">
        <h1 className="text-sm font-mono font-semibold tracking-wide text-muted-foreground uppercase">
          Sigil
        </h1>
      </header>

      <StatusPanel />

      <NotificationFeed />

      <CommandPanel />
    </div>
  );
}
