import { useEffect, useMemo, useRef } from "react";
import { useLocation as useLocationDetail } from "@/hooks/use-locations";
import { formatAud, formatDistanceKm, relativeTime } from "@/lib/format";
import { useT } from "@/lib/i18n";
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
import { haversineDistance } from "@shared/consensus";
import type {
  BarrierFact,
  LocationWithConsensus,
  PinStatus,
  Report,
} from "@shared/schema";

interface DetailSheetProps {
  locationId: string;
  geo?: { lat: number; lon: number };
  mode?: "plan" | "now";
  onClose: () => void;
  onReport: () => void;
}

const STATUS_DOT: Record<PinStatus, { tone: string; symbol: string }> = {
  green: { tone: "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800", symbol: "●" },
  amber: { tone: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800", symbol: "△" },
  red: { tone: "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800", symbol: "✗" },
  grey: { tone: "text-fg-muted bg-surface-inset border-nl-border", symbol: "○" },
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

// `geo` is no longer part of the detail cache key, so the server-computed
// `distance` may be stale relative to the user's current position. Recompute
// here from the cached lat/lon when we have a fix.
function withClientDistance(
  loc: LocationWithConsensus,
  geo?: { lat: number; lon: number },
): LocationWithConsensus {
  if (!geo) return loc;
  return {
    ...loc,
    distance: haversineDistance(geo, {
      lat: Number(loc.latitude),
      lon: Number(loc.longitude),
    }),
  };
}

export function DetailSheet({
  locationId,
  geo,
  mode = "plan",
  onClose,
  onReport,
}: DetailSheetProps) {
  const t = useT();
  const detailQuery = useLocationDetail(locationId, geo);
  const sheetRef = useRef<HTMLDivElement>(null);

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
      className="fixed inset-x-0 bottom-0 z-30 max-h-[80dvh] overflow-y-auto rounded-t-2xl border-t border-nl-border bg-surface shadow-2xl outline-none animate-sheet-up"
    >
      <div className="flex justify-center pt-2">
        <div className="h-1 w-10 rounded-full bg-fg-faint/40" aria-hidden="true" />
      </div>

      <div className="px-5 pt-3 pb-8 text-fg">
        {detailQuery.isLoading ? (
          <SheetSkeleton />
        ) : detailQuery.isError || !detailQuery.data ? (
          <SheetError onClose={onClose} />
        ) : mode === "now" ? (
          <SheetBodyNow location={withClientDistance(detailQuery.data, geo)} />
        ) : (
          <SheetBody
            location={withClientDistance(detailQuery.data, geo)}
            onReport={onReport}
          />
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className="text-sm text-fg-muted hover:text-fg focus:outline-none focus:underline"
            onClick={onClose}
          >
            {t("actions.close")}
          </button>
        </div>
      </div>
    </aside>
  );
}

function SheetSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-5 w-2/3 rounded bg-surface-inset" />
      <div className="h-3 w-1/2 rounded bg-surface-inset" />
      <div className="h-12 rounded bg-surface-inset" />
      <div className="h-32 rounded bg-surface-inset" />
    </div>
  );
}

function SheetError({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <div className="text-sm">
      <p className="font-medium text-fg">{t("detail.error_title")}</p>
      <p className="mt-1 text-fg-muted">
        {t("detail.error_body")}
      </p>
      <button
        type="button"
        className="mt-4 rounded-xl border border-nl-border-input px-3 py-1.5 text-xs hover:bg-nl-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nl-primary"
        onClick={onClose}
      >
        {t("actions.dismiss")}
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
  const t = useT();
  const status = STATUS_DOT[location.pinStatus];
  return (
    <>
      <header>
        <h2 id="detail-name" className="text-lg font-semibold leading-tight">
          {location.name}
        </h2>
        <p className="mt-0.5 text-sm text-fg-muted">{location.address}</p>
        {location.distance !== undefined ? (
          <p className="mt-0.5 text-xs text-fg-muted">
            {formatDistanceKm(location.distance)} {t("detail.away")}
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
              className="inline-flex items-center gap-1 text-xs text-fg-secondary"
              aria-label={`Reliability ${location.reliabilityStars} out of 5 from ${location.totalReportsCount} reports`}
            >
              {"★".repeat(location.reliabilityStars)}
              <span className="text-fg-faint">
                {"★".repeat(Math.max(0, 5 - location.reliabilityStars))}
              </span>
              <span className="text-fg-muted">
                {t("detail.reports_count").replace("{count}", String(location.totalReportsCount))}
              </span>
            </span>
          ) : null}
          {location.verificationLevel === "official" ? (
            <span className="rounded-full bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-300">
              {t("detail.official_partner")}
            </span>
          ) : location.verificationLevel === "community_verified" ? (
            <span className="rounded-full bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
              {t("detail.community_verified")}
            </span>
          ) : null}
        </div>
      </header>

      <GuardianNotes notes={location.guardianNotes} />
      <RegistryFact location={location} />
      <Facts location={location} />
      <BarrierFactsList facts={location.barrierFacts} />
      <RecentReports reports={location.recentReports} total={location.totalReportsCount} />
      <Actions location={location} onReport={onReport} />
    </>
  );
}

function SheetBodyNow({ location }: { location: LocationWithConsensus }) {
  const t = useT();
  const status = STATUS_DOT[location.pinStatus];
  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
  const formList = location.naloxoneForms.map((f) =>
    f === "nasal_spray" ? t("detail.nasal_spray") : t("detail.injectable"),
  );
  return (
    <>
      <header>
        <h2 id="detail-name" className="text-lg font-semibold leading-tight">
          {location.name}
        </h2>
        <p className="mt-1 text-sm text-fg-secondary">
          {location.distance !== undefined ? `${formatDistanceKm(location.distance)} ${t("detail.away")}` : null}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${status.tone}`}
          >
            <span aria-hidden="true">{status.symbol}</span>
            {location.consensusLabel}
          </span>
          <span className="text-xs text-fg-secondary">
            {formList.join(" + ")}
          </span>
        </div>
      </header>
      <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
        <a
          href={directionsHref}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl bg-nl-primary px-3 py-3 text-center text-nl-on-primary hover:bg-nl-primary-hover active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nl-primary transition-transform"
        >
          ↗ {t("actions.directions")}
        </a>
        {location.phone ? (
          <a
            href={`tel:${location.phone}`}
            className="rounded-xl border border-nl-border-input px-3 py-3 text-center text-fg hover:bg-nl-hover active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nl-primary transition-transform"
          >
            📞 {t("actions.call_this_place")}
          </a>
        ) : (
          <span className="rounded-xl border border-nl-border px-3 py-3 text-center text-fg-faint">
            {t("detail.no_phone")}
          </span>
        )}
      </div>
    </>
  );
}

function RegistryFact({ location }: { location: LocationWithConsensus }) {
  const t = useT();
  const onThn = location.thnObjectId != null;
  const onNswNsp = location.nswNspListing != null;
  const onVicNsp = location.vicNspListing != null;
  const vicSuppliesNaloxone = location.vicNspSuppliesNaloxone === true;
  if (!onThn && !onNswNsp && !onVicNsp) return null;
  const vicListingLabel = location.vicNspListing
    ? location.vicNspListing.replace(/_/g, " ")
    : "";
  return (
    <section
      className="mt-4 rounded-xl border border-nl-border bg-surface-inset p-3 text-xs text-fg-secondary space-y-2"
      aria-label={t("detail.registry_label")}
    >
      {onThn ? (
        <p>
          Listed on the{" "}
          <a
            href="https://www.health.gov.au/our-work/take-home-naloxone-program"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 dark:text-blue-400 underline focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-700"
          >
            Take Home Naloxone Program
          </a>{" "}
          participating-site registry.
        </p>
      ) : null}
      {onNswNsp ? (
        <p>
          NSW Health lists this as a{" "}
          <span className="font-medium">{location.nswNspListing}</span>{" "}
          <a
            href="https://www.health.nsw.gov.au/aod/Pages/nsp-finder.aspx"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 dark:text-blue-400 underline focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-700"
          >
            Needle and Syringe Program outlet
          </a>
          .
        </p>
      ) : null}
      {onVicNsp ? (
        <p>
          Victorian Department of Health lists this as a{" "}
          <span className="font-medium">{vicListingLabel}</span>{" "}
          <a
            href="https://www.health.vic.gov.au/aod-treatment-services/needle-and-syringe-program"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 dark:text-blue-400 underline focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-700"
          >
            Needle and Syringe Program outlet
          </a>
          {vicSuppliesNaloxone
            ? " — funded to supply naloxone through the NSP."
            : "."}
        </p>
      ) : null}
      <p className="text-fg-muted">{t("detail.registry_note")}</p>
    </section>
  );
}

function GuardianNotes({
  notes,
}: {
  notes: LocationWithConsensus["guardianNotes"];
}) {
  const t = useT();
  if (notes.length === 0) return null;
  return (
    <section className="mt-5 space-y-3">
      {notes.map((note) => (
        <div
          key={note.id}
          className="rounded-xl border border-blue-100 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/60 p-3 text-sm"
        >
          <div className="flex items-center gap-1 text-blue-900 dark:text-blue-200">
            <span aria-hidden="true">💬</span>
            <span className="font-medium">{note.guardianFirstName}</span>
            <span className="text-blue-700/80 dark:text-blue-400/80">
              {t("detail.guardian_badge").replace("{org}", note.guardianOrganisation)}
            </span>
          </div>
          <p className="mt-1 text-blue-900 dark:text-blue-200">{note.noteText}</p>
          <p className="mt-1 text-xs text-blue-700/70 dark:text-blue-400/70">
            {relativeTime(note.updatedAt)}
          </p>
        </div>
      ))}
    </section>
  );
}

function Facts({ location }: { location: LocationWithConsensus }) {
  const t = useT();
  const formList: string[] = location.naloxoneForms.map((f) =>
    f === "nasal_spray" ? t("detail.nasal_spray") : t("detail.injectable"),
  );
  return (
    <section className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
      {location.hours ? (
        <FactRow label={t("detail.hours")} value={location.hours} />
      ) : null}
      {location.phone ? (
        <FactRow
          label={t("detail.phone")}
          value={
            <a className="text-blue-700 dark:text-blue-400 hover:underline" href={`tel:${location.phone}`}>
              {location.phone}
            </a>
          }
        />
      ) : null}
      {location.website ? (
        <FactRow
          label={t("detail.website")}
          value={
            <a
              className="text-blue-700 dark:text-blue-400 hover:underline"
              href={location.website}
              target="_blank"
              rel="noreferrer"
            >
              {new URL(location.website).hostname.replace(/^www\./, "")}
            </a>
          }
        />
      ) : null}
      <FactRow label={t("detail.naloxone_form")} value={formList.join(" + ")} />
      {location.tags.length > 0 ? (
        <FactRow
          label={t("detail.tags")}
          value={
            <div className="flex flex-wrap gap-1">
              {location.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-surface-inset px-2 py-0.5 text-xs text-fg-secondary"
                >
                  {t.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          }
        />
      ) : null}
      {location.accessNotes ? (
        <FactRow label={t("detail.access_notes")} value={location.accessNotes} />
      ) : null}
    </section>
  );
}

function FactRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-fg-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-fg">{value}</dd>
    </div>
  );
}

function BarrierFactsList({ facts }: { facts: BarrierFact[] }) {
  const t = useT();
  if (facts.length === 0) return null;
  return (
    <section className="mt-5">
      <h3 className="text-xs uppercase tracking-wide text-fg-muted">
        {t("detail.from_recent_reports")}
      </h3>
      <ul className="mt-2 space-y-1 text-sm">
        {facts.map((f) => {
          const tone =
            f.kind === "rare"
              ? "text-emerald-700 dark:text-emerald-400"
              : f.kind === "frequent"
                ? "text-amber-700 dark:text-amber-400"
                : "text-fg-secondary";
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
  const t = useT();
  if (reports.length === 0) {
    return (
      <section className="mt-5">
        <h3 className="text-xs uppercase tracking-wide text-fg-muted">
          {t("detail.recent_reports")}
        </h3>
        <p className="mt-2 text-sm text-fg-muted">{t("detail.no_reports")}</p>
      </section>
    );
  }
  return (
    <section className="mt-5">
      <h3 className="text-xs uppercase tracking-wide text-fg-muted">
        {t("detail.recent_reports")}
      </h3>
      <ul className="mt-2 space-y-1 text-sm">
        {reports.slice(0, 5).map((r) => (
          <li key={r.id} className="flex items-start gap-2">
            <span aria-hidden="true" className="w-3">
              {REPORT_GLYPH[r.reportType]}
            </span>
            <span className="text-fg-secondary">
              {relativeTime(r.submittedAt)} — {reportLineForRow(r)}
              {r.costAmount ? ` (${formatAud(r.costAmount)})` : ""}
            </span>
          </li>
        ))}
      </ul>
      {total > 5 ? (
        <p className="mt-2 text-xs text-fg-muted">{t("detail.more_reports").replace("{count}", String(total - 5))}</p>
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
  const t = useT();
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
          className="rounded-xl border border-nl-border-input px-3 py-2 text-fg hover:bg-nl-hover active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nl-primary transition-transform"
          aria-label={t("detail.report_visit_label")}
        >
          ⊕ {t("actions.i_went_here")}
        </button>
        <button
          type="button"
          onClick={handleSaveToggle}
          disabled={save.isPending || unsave.isPending}
          aria-pressed={!!savedRow}
          aria-label={savedRow ? `Unsave ${location.name}` : `${t("actions.save")} ${location.name}`}
          className={`rounded-xl border px-3 py-2 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nl-primary transition-transform ${
            savedRow
              ? "bg-nl-primary text-nl-on-primary border-nl-primary"
              : "border-nl-border-input text-fg hover:bg-nl-hover"
          }`}
        >
          {savedRow ? `🔖 ${t("actions.saved")}` : `🔖 ${t("actions.save")}`}
        </button>
        <button
          type="button"
          onClick={handleWatchToggle}
          disabled={watch.isPending || unwatch.isPending}
          aria-pressed={!!watchRow}
          aria-label={watchRow ? `${t("my_places.stop_watching")} ${location.name}` : `${t("actions.watch")} ${location.name}`}
          className={`rounded-xl border px-3 py-2 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nl-primary transition-transform ${
            watchRow
              ? "bg-nl-primary text-nl-on-primary border-nl-primary"
              : "border-nl-border-input text-fg hover:bg-nl-hover"
          }`}
        >
          {watchRow ? `🔔 ${t("actions.watching")}` : `🔔 ${t("actions.watch")}`}
        </button>
      </div>
      <a
        href={directionsHref}
        target="_blank"
        rel="noreferrer"
        className="block w-full rounded-xl bg-nl-primary px-3 py-3 text-center text-sm text-nl-on-primary hover:bg-nl-primary-hover active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nl-primary transition-transform"
      >
        ↗ {t("actions.directions")}
      </a>
    </section>
  );
}
