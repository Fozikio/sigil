import { useEffect, useState } from "react";

const BASE_URL = import.meta.env.VITE_SIGIL_URL ?? "";

interface HealthData {
  healthy: boolean;
  clients: number;
  sessions: number;
  uptime: number;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h${rem > 0 ? ` ${rem}m` : ''}`;
}

export function StatusFooter({ connected }: { connected: boolean }) {
  const [health, setHealth] = useState<HealthData | null>(null);

  useEffect(() => {
    const check = () => {
      fetch(`${BASE_URL}/health`)
        .then(r => r.json())
        .then(setHealth)
        .catch(() => setHealth(null));
    };
    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="px-4 py-1.5 border-t border-border/15 flex items-center gap-3 text-[9px] text-muted-foreground/30 tabular-nums">
      <span className={connected ? 'text-[var(--sigil-ok)]/40' : 'text-[var(--sigil-error)]/40'}>
        {connected ? '● connected' : '○ disconnected'}
      </span>
      {health && (
        <>
          <span>up {formatUptime(health.uptime)}</span>
          <span>{health.clients} client{health.clients !== 1 ? 's' : ''}</span>
        </>
      )}
      <span className="ml-auto">sigil v0.1</span>
    </div>
  );
}
