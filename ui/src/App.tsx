import { useState, useEffect } from "react";
import { StatusPanel } from "@/components/StatusPanel";
import { NotificationFeed } from "@/components/NotificationFeed";
import { CommandPanel } from "@/components/CommandPanel";
import { StatusFooter } from "@/components/StatusFooter";
import { LoginGate } from "@/components/LoginGate";
import { useSigil } from "@/hooks/useSigil";

const BASE_URL = import.meta.env.VITE_SIGIL_URL ?? "";

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null); // null = checking

  // Check if we're authenticated on mount
  useEffect(() => {
    fetch(`${BASE_URL}/sigil/status`, { credentials: "include" })
      .then((r) => {
        setAuthed(r.ok);
      })
      .catch(() => setAuthed(false));
  }, []);

  // Still checking auth
  if (authed === null) {
    return (
      <div className="h-dvh flex items-center justify-center bg-background sigil-scanlines">
        <div className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40 sigil-pulse">
          Connecting
        </div>
      </div>
    );
  }

  // Not authed — show login
  if (!authed) {
    return <LoginGate onLogin={() => setAuthed(true)} />;
  }

  return <Dashboard />;
}

function Dashboard() {
  const sigil = useSigil();

  return (
    <div className="h-dvh flex flex-col bg-background text-foreground sigil-scanlines">
      <header className="px-4 py-2 flex items-center justify-between border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className={`h-1.5 w-1.5 rounded-full ${
            sigil.connected ? "bg-[var(--sigil-ok)] sigil-glow-ok" : "bg-[var(--sigil-error)] sigil-glow-error"
          }`} />
          <span className="text-[11px] font-semibold tracking-[0.15em] uppercase text-muted-foreground/70">
            Sigil
          </span>
          {sigil.pendingApprovals.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--sigil-approval)]/15 text-[var(--sigil-approval)] font-medium">
              {sigil.pendingApprovals.length} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40">
          {sigil.sessions.length > 0 && (
            <span className="text-[var(--sigil-ok)]/70">
              {sigil.sessions.length} active
            </span>
          )}
          {sigil.notifications.length > 0 && (
            <button
              onClick={sigil.clearAll}
              className="hover:text-foreground/60 transition-colors"
            >
              clear
            </button>
          )}
        </div>
      </header>

      <StatusPanel sessions={sigil.sessions} />

      <NotificationFeed
        notifications={sigil.notifications}
        onGesture={sigil.sendGesture}
        onDismiss={sigil.dismissNotification}
      />

      <CommandPanel
        commands={sigil.commands}
        onCommand={sigil.sendCommand}
      />

      <StatusFooter connected={sigil.connected} />
    </div>
  );
}
