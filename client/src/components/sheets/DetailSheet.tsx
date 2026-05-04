import { useEffect, useMemo, useRef } from "react";
import { useLocation as useLocationDetail } from "@/hooks/use-locations";
import { formatAud, formatDistanceKm, relativeTime } from "@/lib/format";
import {
  useSaveLocation,
  useSavedPlaces,
  useUnsaveLocation,
} from "@/hooks/use-saved-places";
import {
  useUnwatchLocation,
  useWatchLocation,
  useWatches,
} from "@/hooks/use-watches";
import { usePushSubscription } from "@/hooks/use-push";
import type {
  BarrierFact,
  LocationWithConsensus,
  PinStatus,
  Report,
} from "@shared/schema";

interface DetailSheetProps {
  locationId: string;
  geo?: { lat: number; lon: number };
  onClose: () => void;
  onReport: () => void;
}

const STATUS_DOT: Record<PinStatus, { tone: string; symbol: string }> = {
  green: { tone: "text-green-700 bg-green-50 border-green-200", symbol: "●" },
  amber: { tone: "text-amber-700 bg-amber-50 border-amber-200", symbol: "△" },
  red: { tone: "text-red-700 bg-red-50 border-red-200", symbol: "✗" },
  grey: { tone: "text-neutral-600 bg-neutral-50 border-neutral-200", symbol: "○" },
};

const REPORT_GLYPH: Record<Report["reportType"], string> = {
  success: "✓",
  success_but: "△",
  out_of_stock: "·",
  denied: "✗",
};

const REPORT_LABEL: Record<Report["reportType"], string> = {
  success: "got it, no issues",
  success_but: "got it, with issues",
  out_of_stock: "out of stock",
  denied: "turned away",
};

function reportLineForRow(r: Report): string {
  const base = REPORT_LABEL[r.reportType];
  if (r.barriers.length === 0) return base;
  return `${base} — ${r.barriers.join(", ").replace(/_/g, " ")}`;
}

export function DetailSheet({ locationId, geo, onClose, onReport }: DetailSheetProps) {
  const detailQuery = useLocationDetail(locationId, geo);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Move focus to the sheet when it opens for keyboard / screen-reader users.
  useEffect(() => {
    sheetRef.current?.focus();
  }, [locationId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      ref={sheetRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-labelledby="detail-name"
      className="fixed inset-x-0 bottom-0 z-30 max-h-[80dvh] overflow-y-auto rounded-t-2xl border-t bg-white shadow-2xl outline-none"
    >
      <div className="flex justify-center pt-2">
        <div className="h-1 w-10 rounded-full bg-neutral-300" aria-hidden="true" />
      </div>

      <div className="px-5 pt-3 pb-6 text-neutral-900">
        {detailQuery.isLoading ? (
          <SheetSkeleton />
        ) : detailQuery.isError || !detailQuery.data ? (
          <SheetError onClose={onClose} />
        ) : (
          <SheetBody location={detailQuery.data} onReport={onReport} />
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className="text-sm text-neutral-600 hover:text-neutral-900 focus:outline-none focus:underline"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </aside>
  );
}

function SheetSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-5 w-2/3 rounded bg-neutral-200" />
      <div className="h-3 w-1/2 rounded bg-neutral-200" />
      <div className="h-12 rounded bg-neutral-100" />
      <div className="h-32 rounded bg-neutral-100" />
    </div>
  );
}

function SheetError({ onClose }: { onClose: () => void }) {
  return (
    <div className="text-sm">
      <p className="font-medium text-neutral-900">Could not load this place.</p>
      <p className="mt-1 text-neutral-600">
        Check your connection and try again. The map&rsquo;s last-loaded pins
        should still be visible behind this sheet.
      </p>
      <button
        type="button"
        className="mt-4 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50"
        onClick={onClose}
      >
        Dismiss
      </button>
    </div>
  );
}

function SheetBody({
  location,
  onReport,
}: {
  location: LocationWithConsensus;
  onReport: () => void;
}) {
  const status = STATUS_DOT[location.pinStatus];
  return (
    <>
      <header>
        <h2 id="detail-name" className="text-lg font-semibold leading-tight">
          {location.name}
        </h2>
        <p className="mt-0.5 text-sm text-neutral-600">{location.address}</p>
        {location.distance !== undefined ? (
          <p className="mt-0.5 text-xs text-neutral-500">
            {formatDistanceKm(location.distance)} away
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${status.tone}`}
          >
            <span aria-hidden="true">{status.symbol}</span>
            {location.consensusLabel}
          </span>
          {location.reliabilityStars > 0 ? (
            <span
              className="inline-flex items-center gap-1 text-xs text-neutral-700"
              aria-label={`Reliability ${location.reliabilityStars} out of 5 from ${location.totalReportsCount} reports`}
            >
              {"★".repeat(location.reliabilityStars)}
              <span className="text-neutral-400">
                {"★".repeat(Math.max(0, 5 - location.reliabilityStars))}
              </span>
              <span className="text-neutral-500">
                ({location.totalReportsCount} reports)
              </span>
            </span>
          ) : null}
          {location.verificationLevel === "official" ? (
            <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs text-blue-700">
              Official partner
            </span>
          ) : location.verificationLevel === "community_verified" ? (
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs text-emerald-700">
              Community verified
            </span>
          ) : null}
        </div>
      </header>

      <GuardianNotes notes={location.guardianNotes} />
      <Facts location={location} />
      <BarrierFactsList facts={location.barrierFacts} />
      <RecentReports reports={location.recentReports} total={location.totalReportsCount} />
      <Actions location={location} onReport={onReport} />
    </>
  );
}

function GuardianNotes({
  notes,
}: {
  notes: LocationWithConsensus["guardianNotes"];
}) {
  if (notes.length === 0) return null;
  return (
    <section className="mt-5 space-y-3">
      {notes.map((note) => (
        <div
          key={note.id}
          className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-sm"
        >
          <div className="flex items-center gap-1 text-blue-900">
            <span aria-hidden="true">💬</span>
            <span className="font-medium">{note.guardianFirstName}</span>
            <span className="text-blue-700/80">
              (verified guardian, {note.guardianOrganisation})
            </span>
          </div>
          <p className="mt-1 text-blue-900">{note.noteText}</p>
          <p className="mt-1 text-xs text-blue-700/70">
            {relativeTime(note.updatedAt)}
          </p>
        </div>
      ))}
    </section>
  );
}

function Facts({ location }: { location: LocationWithConsensus }) {
  const formList: string[] = location.naloxoneForms.map((f) =>
    f === "nasal_spray" ? "Nasal spray" : "Injectable",
  );
  return (
    <section className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
      {location.hours ? (
        <FactRow label="Hours" value={location.hours} />
      ) : null}
      {location.phone ? (
        <FactRow
          label="Phone"
          value={
            <a className="text-blue-700 hover:underline" href={`tel:${location.phone}`}>
              {location.phone}
            </a>
          }
        />
      ) : null}
      {location.website ? (
        <FactRow
          label="Website"
          value={
            <a
              className="text-blue-700 hover:underline"
              href={location.website}
              target="_blank"
              rel="noreferrer"
            >
              {new URL(location.website).hostname.replace(/^www\./, "")}
            </a>
          }
        />
      ) : null}
      <FactRow label="Naloxone form" value={formList.join(" + ")} />
      {location.tags.length > 0 ? (
        <FactRow
          label="Tags"
          value={
            <div className="flex flex-wrap gap-1">
              {location.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700"
                >
                  {t.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          }
        />
      ) : null}
      {location.accessNotes ? (
        <FactRow label="Access notes" value={location.accessNotes} />
      ) : null}
    </section>
  );
}

function FactRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-neutral-900">{value}</dd>
    </div>
  );
}

function BarrierFactsList({ facts }: { facts: BarrierFact[] }) {
  if (facts.length === 0) return null;
  return (
    <section className="mt-5">
      <h3 className="text-xs uppercase tracking-wide text-neutral-500">
        From recent reports
      </h3>
      <ul className="mt-2 space-y-1 text-sm">
        {facts.map((f) => {
          const tone =
            f.kind === "rare"
              ? "text-emerald-700"
              : f.kind === "frequent"
                ? "text-amber-700"
                : "text-neutral-700";
          const symbol = f.kind === "rare" ? "⊘" : f.kind === "frequent" ? "△" : "·";
          return (
            <li key={f.barrier} className={`flex items-start gap-2 ${tone}`}>
              <span aria-hidden="true">{symbol}</span>
              <span>{f.label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RecentReports({
  reports,
  total,
}: {
  reports: Report[];
  total: number;
}) {
  if (reports.length === 0) {
    return (
      <section className="mt-5">
        <h3 className="text-xs uppercase tracking-wide text-neutral-500">
          Recent reports
        </h3>
        <p className="mt-2 text-sm text-neutral-500">No reports yet.</p>
      </section>
    );
  }
  return (
    <section className="mt-5">
      <h3 className="text-xs uppercase tracking-wide text-neutral-500">
        Recent reports
      </h3>
      <ul className="mt-2 space-y-1 text-sm">
        {reports.slice(0, 5).map((r) => (
          <li key={r.id} className="flex items-start gap-2">
            <span aria-hidden="true" className="w-3">
              {REPORT_GLYPH[r.reportType]}
            </span>
            <span className="text-neutral-700">
              {relativeTime(r.submittedAt)} — {reportLineForRow(r)}
              {r.costAmount ? ` (${formatAud(r.costAmount)})` : ""}
            </span>
          </li>
        ))}
      </ul>
      {total > 5 ? (
        <p className="mt-2 text-xs text-neutral-500">+ {total - 5} more</p>
      ) : null}
    </section>
  );
}

function Actions({
  location,
  onReport,
}: {
  location: LocationWithConsensus;
  onReport: () => void;
}) {
  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
  const saved = useSavedPlaces();
  const watches = useWatches();
  const save = useSaveLocation();
  const unsave = useUnsaveLocation();
  const watch = useWatchLocation();
  const unwatch = useUnwatchLocation();
  const push = usePushSubscription();

  const savedRow = useMemo(
    () => saved.data?.find((row) => row.locationId === location.id) ?? null,
    [saved.data, location.id],
  );
  const watchRow = useMemo(
    () => watches.data?.find((row) => row.locationId === location.id) ?? null,
    [watches.data, location.id],
  );

  const handleSaveToggle = () => {
    if (savedRow) unsave.mutate(savedRow.id);
    else save.mutate({ locationId: location.id });
  };

  const handleWatchToggle = async () => {
    if (watchRow) {
      unwatch.mutate(watchRow.id);
      return;
    }
    // Pre-prompt before browser permission ask is the *creation* of the
    // watch entry — it implicitly says "yes, I want notifications about
    // this place." Then we ask the OS for the permission.
    watch.mutate(
      { locationId: location.id },
      {
        onSuccess: () => {
          if (push.permission === "default") void push.requestAndSubscribe();
          else if (push.permission === "granted" && !push.isSubscribed)
            void push.requestAndSubscribe();
        },
      },
    );
  };

  return (
    <section className="mt-6 space-y-3">
      <div className="grid grid-cols-3 gap-2 text-sm">
        <button
          type="button"
          onClick={onReport}
          className="rounded-xl border border-neutral-300 px-3 py-2 text-neutral-900 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900"
          aria-label="Report a visit to this place"
        >
          ⊕ I went here
        </button>
        <button
          type="button"
          onClick={handleSaveToggle}
          disabled={save.isPending || unsave.isPending}
          aria-pressed={!!savedRow}
          aria-label={savedRow ? `Unsave ${location.name}` : `Save ${location.name}`}
          className={`rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900 ${
            savedRow
              ? "bg-neutral-900 text-white border-neutral-900"
              : "border-neutral-300 text-neutral-900 hover:bg-neutral-50"
          }`}
        >
          {savedRow ? "🔖 Saved" : "🔖 Save"}
        </button>
        <button
          type="button"
          onClick={handleWatchToggle}
          disabled={watch.isPending || unwatch.isPending}
          aria-pressed={!!watchRow}
          aria-label={watchRow ? `Stop watching ${location.name}` : `Watch ${location.name}`}
          className={`rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900 ${
            watchRow
              ? "bg-neutral-900 text-white border-neutral-900"
              : "border-neutral-300 text-neutral-900 hover:bg-neutral-50"
          }`}
        >
          {watchRow ? "🔔 Watching" : "🔔 Watch"}
        </button>
      </div>
      <a
        href={directionsHref}
        target="_blank"
        rel="noreferrer"
        className="block w-full rounded-xl bg-neutral-900 px-3 py-3 text-center text-sm text-white hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900"
      >
        ↗ Directions
      </a>
    </section>
  );
}
