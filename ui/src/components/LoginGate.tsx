import { useState } from "react";

interface Props {
  onLogin: () => void;
}

export function LoginGate({ onLogin }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const BASE_URL = import.meta.env.VITE_SIGIL_URL ?? "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(false);

    try {
      const res = await fetch(`${BASE_URL}/sigil/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `password=${encodeURIComponent(password)}`,
        credentials: "include",
      });

      if (res.ok) {
        onLogin();
      } else {
        setError(true);
        setPassword("");
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-dvh flex items-center justify-center bg-background sigil-scanlines">
      <form onSubmit={handleSubmit} className="w-64 space-y-4">
        <div className="text-center space-y-1">
          <div className="text-[11px] font-semibold tracking-[0.3em] uppercase text-muted-foreground">
            Sigil
          </div>
          <div className="h-px w-8 mx-auto bg-border/50" />
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="token"
          autoFocus
          className={`w-full bg-[var(--sigil-surface)] border ${
            error ? "border-[var(--sigil-error)]" : "border-border/50"
          } rounded px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-[var(--sigil-ok)]/50 transition-colors`}
        />

        <button
          type="submit"
          disabled={loading || !password}
          className="w-full py-2 text-[11px] font-medium border border-border/50 rounded text-muted-foreground hover:text-[var(--sigil-ok)] hover:border-[var(--sigil-ok)]/50 transition-colors disabled:opacity-30"
        >
          {loading ? "..." : "Enter"}
        </button>

        {error && (
          <p className="text-[10px] text-[var(--sigil-error)] text-center">
            Invalid token
          </p>
        )}
      </form>
    </div>
  );
}
