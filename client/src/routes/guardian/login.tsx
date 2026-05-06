import { useEffect, useState } from "react";
import { useLocation as useWouterLocation } from "wouter";
import { ApiError, api } from "@/lib/api";

interface LoginResponse {
  guardian: {
    id: string;
    firstName: string;
    organisation: string;
    affiliatedLocationIds: string[];
    isAdmin: boolean;
  };
}

export default function GuardianLoginRoute() {
  const [, navigate] = useWouterLocation();
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("t");
    if (t) setToken(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError("Token is required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api<LoginResponse>("/api/guardian/login", {
        method: "POST",
        body: { token: token.trim() },
      });
      navigate("/guardian/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setError("Too many attempts. Wait a few minutes and try again.");
        } else if (err.status === 401) {
          setError("Token not recognised, expired, or revoked.");
        } else {
          setError(err.message || "Could not sign in.");
        }
      } else {
        setError("Could not reach the server.");
      }
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-dvh flex items-center justify-center px-4 bg-surface-dim text-fg">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-md ring-1 ring-nl-ring space-y-4"
      >
        <header>
          <h1 className="text-xl font-semibold">Guardian sign-in</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Paste the token your admin sent you. Tokens are issued out of band;
            this surface is not for the public app.
          </p>
        </header>

        <label className="block">
          <span className="block text-sm font-medium text-fg-secondary mb-1">
            Token
          </span>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border border-nl-border-input bg-surface px-3 py-2.5 text-sm text-fg focus:border-nl-primary focus:outline-none focus:ring-1 focus:ring-nl-primary"
            aria-label="Guardian token"
          />
        </label>

        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-nl-primary px-3 py-3 text-sm font-medium text-nl-on-primary hover:bg-nl-primary-hover active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nl-primary disabled:opacity-50 transition-transform"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>

        <p className="text-xs text-fg-muted">
          Need access?{" "}
          <a className="text-blue-700 dark:text-blue-400 hover:underline" href="mailto:guardians@example.org">
            guardians@example.org
          </a>
        </p>
      </form>
    </main>
  );
}
