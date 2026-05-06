import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation as useWouterLocation } from "wouter";
import { api, ApiError } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { LocationWithConsensus } from "@shared/schema";

interface GuardianMe {
  guardian: {
    id: string;
    firstName: string;
    organisation: string;
    affiliatedLocationIds: string[];
    isAdmin: boolean;
  };
}

interface MyNote {
  id: string;
  locationId: string;
  noteText: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  location: { id: string; name: string; address: string };
}

export default function GuardianDashboardRoute() {
  const t = useT();
  const [, navigate] = useWouterLocation();
  const me = useQuery({
    queryKey: ["guardian-me"],
    queryFn: ({ signal }) => api<GuardianMe>("/api/guardian/me", { signal }),
    retry: false,
  });

  if (me.isError && me.error instanceof ApiError && me.error.status === 401) {
    navigate("/guardian");
    return null;
  }

  if (me.isLoading) {
    return (
      <main className="min-h-dvh flex items-center justify-center text-sm text-fg-muted">
        {t("actions.loading")}
      </main>
    );
  }
  if (!me.data) return null;
  const guardian = me.data.guardian;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 text-fg space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("guardian.dashboard_title")}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {guardian.firstName} — {guardian.organisation}
            {guardian.isAdmin ? ` · ${t("guardian.super_admin")}` : null}
          </p>
        </div>
        <LogoutButton />
      </header>

      <PostNote guardian={guardian} />
      <MyNotes />
      {guardian.isAdmin ? <SuperAdminPanel /> : null}
    </main>
  );
}

function LogoutButton() {
  const t = useT();
  const [, navigate] = useWouterLocation();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api<void>("/api/guardian/logout", { method: "POST" }),
    onSuccess: () => {
      qc.clear();
      navigate("/guardian");
    },
  });
  return (
    <button
      type="button"
      onClick={() => m.mutate()}
      className="rounded-xl border border-nl-border-input px-3 py-1.5 text-xs text-fg-secondary hover:bg-nl-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nl-primary"
    >
      {t("actions.sign_out")}
    </button>
  );
}

function PostNote({ guardian }: { guardian: GuardianMe["guardian"] }) {
  const t = useT();
  const qc = useQueryClient();
  const [locationId, setLocationId] = useState<string>("");
  const [noteText, setNoteText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const allLocations = useQuery({
    queryKey: ["guardian-pickable-locations", guardian.id],
    queryFn: ({ signal }) =>
      api<LocationWithConsensus[]>("/api/locations", { signal }),
    staleTime: 5 * 60_000,
  });

  const pickable = (allLocations.data ?? []).filter((loc) =>
    guardian.isAdmin ? true : guardian.affiliatedLocationIds.includes(loc.id),
  );

  const post = useMutation({
    mutationFn: () =>
      api("/api/guardian/notes", {
        method: "POST",
        body: { locationId, noteText: noteText.trim() },
      }),
    onSuccess: () => {
      setNoteText("");
      qc.invalidateQueries({ queryKey: ["guardian-my-notes"] });
      qc.invalidateQueries({ queryKey: ["location"] });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) setError(err.message);
      else setError(t("guardian.error_post_note"));
    },
  });

  return (
    <section className="rounded-2xl border border-nl-border bg-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{t("guardian.post_note")}</h2>
      <p className="mt-1 text-sm text-fg-muted">
        {t("guardian.post_note_description")}
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (!locationId) {
            setError(t("guardian.error_pick_location"));
            return;
          }
          if (noteText.trim().length === 0) {
            setError(t("guardian.error_write_something"));
            return;
          }
          post.mutate();
        }}
      >
        <label className="block">
          <span className="block text-sm font-medium text-fg-secondary mb-1">
            {t("guardian.location_label")}
          </span>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full rounded-xl border border-nl-border-input bg-surface px-3 py-2 text-sm text-fg focus:border-nl-primary focus:outline-none focus:ring-1 focus:ring-nl-primary"
          >
            <option value="">{t("guardian.location_placeholder")}</option>
            {pickable.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
          {!guardian.isAdmin && pickable.length === 0 ? (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              {t("guardian.no_affiliated")}
            </p>
          ) : null}
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-fg-secondary mb-1">
            {t("guardian.note_label")}
          </span>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={t("guardian.note_placeholder")}
            className="w-full rounded-xl border border-nl-border-input bg-surface px-3 py-2 text-sm text-fg placeholder-fg-faint focus:border-nl-primary focus:outline-none focus:ring-1 focus:ring-nl-primary resize-none"
          />
          <p className="text-xs text-fg-faint text-end">{noteText.length} / 500</p>
        </label>
        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={post.isPending}
          className="w-full rounded-xl bg-nl-primary px-3 py-2.5 text-sm font-medium text-nl-on-primary hover:bg-nl-primary-hover active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nl-primary disabled:opacity-50 transition-transform"
        >
          {post.isPending ? t("guardian.posting") : t("guardian.post")}
        </button>
      </form>
    </section>
  );
}

function MyNotes() {
  const t = useT();
  const qc = useQueryClient();
  const notes = useQuery({
    queryKey: ["guardian-my-notes"],
    queryFn: ({ signal }) => api<MyNote[]>("/api/guardian/notes/mine", { signal }),
    staleTime: 30_000,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/guardian/notes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["guardian-my-notes"] }),
  });

  return (
    <section className="rounded-2xl border border-nl-border bg-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{t("guardian.my_notes")}</h2>
      {notes.isLoading ? (
        <p className="mt-2 text-sm text-fg-muted">{t("actions.loading")}</p>
      ) : !notes.data || notes.data.length === 0 ? (
        <p className="mt-2 text-sm text-fg-muted">{t("guardian.no_notes")}</p>
      ) : (
        <ul className="mt-3 divide-y divide-nl-divider">
          {notes.data.map((n) => (
            <li key={n.id} className="py-3">
              <div className="text-sm font-medium">{n.location.name}</div>
              <div className="text-xs text-fg-muted">{n.location.address}</div>
              <p className={`mt-1 text-sm ${n.archivedAt ? "line-through text-fg-faint" : ""}`}>
                {n.noteText}
              </p>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-fg-muted">
                  {n.archivedAt
                    ? t("guardian.archived_time").replace("{time}", relativeTime(n.archivedAt))
                    : t("guardian.updated_time").replace("{time}", relativeTime(n.updatedAt))}
                </span>
                {!n.archivedAt ? (
                  <button
                    type="button"
                    onClick={() => remove.mutate(n.id)}
                    className="text-xs text-red-700 dark:text-red-400 hover:underline focus:outline-none focus:underline"
                  >
                    {t("guardian.archive")}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SuperAdminPanel() {
  const t = useT();
  return (
    <section className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/40 p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{t("guardian.super_admin_panel")}</h2>
      <IssueTokenForm />
      <AuditLog />
    </section>
  );
}

interface IssueTokenResponse {
  guardianId: string;
  token: string;
  loginUrl: string;
}

function IssueTokenForm() {
  const t = useT();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [affiliated, setAffiliated] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [issued, setIssued] = useState<IssueTokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allLocations = useQuery({
    queryKey: ["all-locations-for-issue"],
    queryFn: ({ signal }) => api<LocationWithConsensus[]>("/api/locations", { signal }),
    staleTime: 5 * 60_000,
  });

  const issue = useMutation({
    mutationFn: () =>
      api<IssueTokenResponse>("/api/guardian/admin/issue-token", {
        method: "POST",
        body: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          organisation: organisation.trim(),
          affiliatedLocationIds: affiliated,
          isAdmin,
        },
      }),
    onSuccess: (data) => {
      setIssued(data);
      setError(null);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) setError(err.message);
      else setError(t("guardian.error_issue_token"));
    },
  });

  return (
    <div className="mt-3 space-y-3">
      <h3 className="text-sm font-medium">{t("guardian.issue_token")}</h3>
      <form
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          issue.mutate();
        }}
      >
        <Input label={t("guardian.field_first_name")} value={firstName} onChange={setFirstName} required />
        <Input label={t("guardian.field_last_name")} value={lastName} onChange={setLastName} required />
        <Input label={t("guardian.field_email")} type="email" value={email} onChange={setEmail} required />
        <Input label={t("guardian.field_organisation")} value={organisation} onChange={setOrganisation} required />
        <label className="sm:col-span-2 block">
          <span className="block text-xs text-fg-secondary mb-1">{t("guardian.affiliated_locations")}</span>
          <select
            multiple
            value={affiliated}
            onChange={(e) =>
              setAffiliated(Array.from(e.target.selectedOptions).map((o) => o.value))
            }
            size={6}
            className="w-full rounded-xl border border-nl-border-input bg-surface px-2 py-1.5 text-xs text-fg focus:border-nl-primary focus:outline-none focus:ring-1 focus:ring-nl-primary"
          >
            {(allLocations.data ?? []).map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-fg-muted">{t("guardian.multi_select_hint")}</p>
        </label>
        <label className="sm:col-span-2 inline-flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
          />
          {t("guardian.grant_super_admin")}
        </label>
        {error ? (
          <p role="alert" className="sm:col-span-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={issue.isPending}
          className="sm:col-span-2 rounded-xl bg-nl-primary px-3 py-2 text-sm font-medium text-nl-on-primary hover:bg-nl-primary-hover active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nl-primary disabled:opacity-50 transition-transform"
        >
          {issue.isPending ? t("guardian.issuing") : t("guardian.issue_token")}
        </button>
      </form>

      {issued ? (
        <div className="rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950 p-3 text-sm">
          <p className="font-medium text-emerald-900 dark:text-emerald-200">
            {t("guardian.token_issued")}
          </p>
          <pre className="mt-2 break-all rounded bg-surface p-2 text-xs">
            {issued.token}
          </pre>
          <p className="mt-2 text-xs">
            {t("guardian.login_url_label")}{" "}
            <a className="text-blue-700 dark:text-blue-400 hover:underline" href={issued.loginUrl}>
              {issued.loginUrl}
            </a>
          </p>
        </div>
      ) : null}
    </div>
  );
}

interface AuditEntry {
  id: string;
  at: string;
  actorGuardianId: string | null;
  action: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
}

function AuditLog() {
  const t = useT();
  const log = useQuery({
    queryKey: ["audit-log"],
    queryFn: ({ signal }) => api<AuditEntry[]>("/api/guardian/admin/audit-log", { signal }),
    staleTime: 30_000,
  });
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-sm font-medium">{t("guardian.audit_log")}</summary>
      {log.isLoading ? (
        <p className="mt-2 text-sm text-fg-muted">{t("actions.loading")}</p>
      ) : !log.data || log.data.length === 0 ? (
        <p className="mt-2 text-sm text-fg-muted">{t("guardian.audit_empty")}</p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs text-fg-secondary">
          {log.data.map((row) => (
            <li key={row.id}>
              <span className="font-mono">{new Date(row.at).toLocaleString("en-AU")}</span>
              {" — "}
              <span className="font-medium">{row.action}</span>
              {row.targetId ? <span className="text-fg-muted"> ({row.targetId.slice(0, 8)}…)</span> : null}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-fg-secondary mb-1">
        {label}
        {required ? <span className="text-red-700 dark:text-red-400"> *</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-xl border border-nl-border-input bg-surface px-3 py-1.5 text-sm text-fg focus:border-nl-primary focus:outline-none focus:ring-1 focus:ring-nl-primary"
      />
    </label>
  );
}
