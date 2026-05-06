import { useEffect, useState } from "react";
import { useLocation as useWouterLocation } from "wouter";
import { ApiError, api } from "@/lib/api";
import { useT } from "@/lib/i18n";

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
  const t = useT();
  const [, navigate] = useWouterLocation();
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tok = params.get("t");
    if (tok) setToken(tok);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError(t("guardian.token_required"));
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
          setError(t("guardian.error_rate_limit"));
        } else if (err.status === 401) {
          setError(t("guardian.error_bad_token"));
        } else {
          setError(err.message || t("guardian.error_generic"));
        }
      } else {
        setError(t("guardian.error_network"));
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
          <h1 className="text-xl font-semibold">{t("guardian.login_title")}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {t("guardian.login_description")}
          </p>
        </header>

        <label className="block">
          <span className="block text-sm font-medium text-fg-secondary mb-1">
            {t("guardian.token_label")}
          </span>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border border-nl-border-input bg-surface px-3 py-2.5 text-sm text-fg focus:border-nl-primary focus:outline-none focus:ring-1 focus:ring-nl-primary"
            aria-label={t("guardian.token_aria")}
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
          {submitting ? t("guardian.signing_in") : t("guardian.sign_in")}
        </button>

        <p className="text-xs text-fg-muted">
          {t("guardian.need_access")}{" "}
          <a className="text-blue-700 dark:text-blue-400 hover:underline" href="mailto:guardians@example.org">
            guardians@example.org
          </a>
        </p>
      </form>
    </main>
  );
}
