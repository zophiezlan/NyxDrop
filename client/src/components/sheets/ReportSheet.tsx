import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatLocalYmd } from "@/lib/format";
import { useReportSubmission, type SubmitResult } from "@/hooks/use-report";
import {
  BARRIERS_FOR_REPORT_TYPE,
  type BarrierValue,
  type LocationType,
  type LocationWithConsensus,
  type ReportType,
} from "@shared/schema";

interface ReportSheetProps {
  /** When set, the sheet skips Step 0 and reports against this location. */
  preselectedLocationId?: string;
  /** When set, used to label the header so the user knows what they're reporting. */
  preselectedName?: string;
  onClose: () => void;
  onSubmitted: (ack: string) => void;
  onQueued: (reason: "offline" | "network_error") => void;
}

type WhenChoice = "today" | "yesterday" | "earlier_week" | "custom";

const REPORT_OPTIONS: Array<{
  value: ReportType;
  glyph: string;
  label: string;
  hint?: string;
}> = [
  { value: "success", glyph: "✓", label: "Got it, no problems" },
  { value: "success_but", glyph: "△", label: "Got it, but…", hint: "ID asked, charged, made me wait, etc." },
  { value: "out_of_stock", glyph: "·", label: "They were out of stock" },
  { value: "denied", glyph: "✗", label: "They turned me away" },
];

const BARRIER_LABEL: Record<BarrierValue, string> = {
  id_required: "Asked for ID",
  medicare_required: "Wanted Medicare card",
  prescription_required: "Wanted a prescription",
  cost_involved: "Charged me",
  wrong_form_only: "Wrong form only stocked",
  long_wait: "Long wait",
  staff_unsure: "Staff seemed unsure",
  staff_rude: "Staff were rude",
  many_questions: "Asked many questions",
  age_restriction: "Age restriction applied",
  limited_hours: "Limited hours / closed",
};

export function ReportSheet({
  preselectedLocationId,
  preselectedName,
  onClose,
  onSubmitted,
  onQueued,
}: ReportSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const { submit, isSubmitting } = useReportSubmission();

  const [locationId, setLocationId] = useState<string | null>(preselectedLocationId ?? null);
  const [locationName, setLocationName] = useState<string | null>(preselectedName ?? null);
  const [whenChoice, setWhenChoice] = useState<WhenChoice>("today");
  const [customDate, setCustomDate] = useState<string>(formatLocalYmd());
  const [reportType, setReportType] = useState<ReportType | null>(null);
  const [barriers, setBarriers] = useState<BarrierValue[]>([]);
  const [costAmount, setCostAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [serverError, setServerError] = useState<string | null>(null);

  // Move focus into the sheet for screen readers / keyboard users.
  useEffect(() => {
    sheetRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const visitDate = useMemo(() => {
    const today = new Date();
    if (whenChoice === "today") return formatLocalYmd(today);
    if (whenChoice === "yesterday") {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      return formatLocalYmd(d);
    }
    if (whenChoice === "earlier_week") {
      const d = new Date(today);
      d.setDate(d.getDate() - 4);
      return formatLocalYmd(d);
    }
    return customDate;
  }, [whenChoice, customDate]);

  const allowedBarriers = reportType ? BARRIERS_FOR_REPORT_TYPE[reportType] : null;
  const barriersRequired = reportType === "success_but" || reportType === "denied";
  const barriersUnlocked = reportType === "success_but" || reportType === "denied" || reportType === "out_of_stock";

  const canSubmit =
    locationId !== null &&
    reportType !== null &&
    (!barriersRequired || barriers.length > 0) &&
    !isSubmitting;

  const handleToggleBarrier = (b: BarrierValue) => {
    setBarriers((prev) =>
      prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b],
    );
  };

  const handleSubmit = async () => {
    if (!locationId || !reportType) return;
    setServerError(null);
    const result: SubmitResult = await submit({
      locationId,
      reportType,
      visitDate,
      barriers,
      costAmount: barriers.includes("cost_involved") && costAmount.trim() !== ""
        ? Number.parseFloat(costAmount).toFixed(2)
        : null,
      notes: notes.trim() === "" ? null : notes.trim(),
    });
    if (result.kind === "submitted") {
      onSubmitted(result.ackMessage);
      onClose();
    } else if (result.kind === "queued") {
      onQueued(result.reason);
      onClose();
    } else if (result.kind === "rate_limited") {
      setServerError("You already reported this place today. Try again tomorrow.");
    } else {
      const msgs = Object.values(result.fields).flat();
      setServerError(msgs[0] ?? "Could not submit. Please check the form.");
    }
  };

  const stepWhereVisible = !preselectedLocationId && !locationId;
  const stepWhenVisible = locationId !== null;
  const stepWhatVisible = locationId !== null;
  const stepBarriersVisible = locationId !== null && barriersUnlocked;
  const stepNotesVisible = locationId !== null && reportType !== null;
  const stepSubmitVisible = locationId !== null && reportType !== null;

  return (
    <aside
      ref={sheetRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-labelledby="report-title"
      className="fixed inset-x-0 bottom-0 z-30 max-h-[90dvh] overflow-y-auto rounded-t-2xl border-t bg-white shadow-2xl outline-none"
    >
      <div className="flex justify-center pt-2">
        <div className="h-1 w-10 rounded-full bg-neutral-300" aria-hidden="true" />
      </div>

      <div className="px-5 pt-3 pb-8 text-neutral-900 space-y-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 id="report-title" className="text-lg font-semibold leading-tight">
              {preselectedLocationId ? "Tell us how it went" : "Report a visit"}
            </h2>
            {locationName ? (
              <p className="mt-0.5 text-sm text-neutral-600">{locationName}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="rounded-md text-sm text-neutral-500 hover:text-neutral-900 focus:outline-none focus:underline"
            onClick={onClose}
            aria-label="Close"
          >
            Close
          </button>
        </header>

        {stepWhereVisible ? (
          <WhereStep
            onPick={(id, name) => {
              setLocationId(id);
              setLocationName(name);
            }}
          />
        ) : null}

        {stepWhenVisible ? (
          <WhenStep
            value={whenChoice}
            onChange={setWhenChoice}
            customDate={customDate}
            onCustomDate={setCustomDate}
          />
        ) : null}

        {stepWhatVisible ? (
          <WhatStep
            value={reportType}
            onChange={(t) => {
              setReportType(t);
              // Drop barriers that aren't valid for the new type.
              const allowed = BARRIERS_FOR_REPORT_TYPE[t];
              setBarriers((prev) => prev.filter((b) => allowed.has(b)));
            }}
          />
        ) : null}

        {stepBarriersVisible && allowedBarriers ? (
          <BarriersStep
            allowed={allowedBarriers}
            selected={barriers}
            required={barriersRequired}
            costAmount={costAmount}
            onCostAmount={setCostAmount}
            onToggle={handleToggleBarrier}
            reportType={reportType!}
          />
        ) : null}

        {stepNotesVisible ? (
          <NotesStep value={notes} onChange={setNotes} />
        ) : null}

        {stepSubmitVisible ? (
          <div className="space-y-2">
            {serverError ? (
              <p role="alert" className="text-sm text-red-700">
                {serverError}
              </p>
            ) : null}
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="w-full rounded-xl bg-neutral-900 px-3 py-3 text-sm font-medium text-white hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Submitting…" : "Submit anonymously"}
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

// -----------------------------------------------------------------------------
// Step 0 — Where?
// -----------------------------------------------------------------------------

function WhereStep({
  onPick,
}: {
  onPick: (id: string, name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocationWithConsensus[]>([]);
  const [searching, setSearching] = useState(false);
  const [showAddNew, setShowAddNew] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const data = await api<LocationWithConsensus[]>("/api/locations/search", {
          query: { q, limit: 20 },
        });
        if (!cancelled) setResults(data);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  if (showAddNew) {
    return (
      <AddNewLocation
        defaultName={query}
        onCancel={() => setShowAddNew(false)}
        onAdded={(loc) => onPick(loc.id, loc.name)}
      />
    );
  }

  return (
    <section aria-labelledby="step-where" className="space-y-2">
      <h3 id="step-where" className="text-xs uppercase tracking-wide text-neutral-500">
        Where did you go?
      </h3>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or address"
        className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
        autoFocus
      />
      <ul className="divide-y divide-neutral-100">
        {results.map((loc) => (
          <li key={loc.id}>
            <button
              type="button"
              className="w-full text-left py-2 hover:bg-neutral-50 focus:bg-neutral-50 focus:outline-none rounded-md px-2"
              onClick={() => onPick(loc.id, loc.name)}
            >
              <div className="text-sm font-medium">{loc.name}</div>
              <div className="text-xs text-neutral-500">{loc.address}</div>
            </button>
          </li>
        ))}
      </ul>
      {query.trim().length >= 2 && !searching ? (
        <button
          type="button"
          className="text-sm text-blue-700 hover:underline"
          onClick={() => setShowAddNew(true)}
        >
          Can&rsquo;t find it? Add &ldquo;{query.trim()}&rdquo; as a new place
        </button>
      ) : null}
    </section>
  );
}

const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  nsp: "NSP / harm-reduction service",
  pharmacy: "Pharmacy",
  hospital: "Hospital",
  community_health: "Community health",
  aod_organisation: "AOD organisation",
  library: "Library",
  public_building: "Public building",
  festival_site: "Festival site",
  drop_in_centre: "Drop-in centre",
  other: "Other",
};

function AddNewLocation({
  defaultName,
  onCancel,
  onAdded,
}: {
  defaultName: string;
  onCancel: () => void;
  onAdded: (loc: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [address, setAddress] = useState("");
  const [type, setType] = useState<LocationType>("pharmacy");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
      },
      () => setError("Could not read your location."),
      { timeout: 10_000 },
    );
  };

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim() || !address.trim() || !latitude || !longitude) {
      setError("Name, address, and a location are all required.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await api<{ id: string; name: string }>("/api/locations", {
        method: "POST",
        body: {
          name: name.trim(),
          address: address.trim(),
          latitude,
          longitude,
          type,
          naloxoneForms: ["nasal_spray"],
          tags: [],
          verificationLevel: "unverified",
        },
      });
      onAdded(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this place.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section aria-labelledby="add-new" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 id="add-new" className="text-xs uppercase tracking-wide text-neutral-500">
          Add a new place
        </h3>
        <button
          type="button"
          className="text-xs text-neutral-600 hover:underline"
          onClick={onCancel}
        >
          Back to search
        </button>
      </div>
      <Field label="Name" required>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
        />
      </Field>
      <Field label="Address" required>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          maxLength={300}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
        />
      </Field>
      <Field label="Type" required>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as LocationType)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
        >
          {(Object.keys(LOCATION_TYPE_LABELS) as LocationType[]).map((t) => (
            <option key={t} value={t}>
              {LOCATION_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Coordinates" required>
        <div className="flex gap-2">
          <input
            type="text"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            placeholder="lat"
            className="w-1/3 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          />
          <input
            type="text"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            placeholder="lon"
            className="w-1/3 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          />
          <button
            type="button"
            onClick={useMyLocation}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-xs hover:bg-neutral-50"
          >
            Use my location
          </button>
        </div>
      </Field>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <button
        type="button"
        disabled={submitting}
        onClick={handleSubmit}
        className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add this place"}
      </button>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-neutral-500 mb-1">
        {label}
        {required ? <span className="text-red-700"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

// -----------------------------------------------------------------------------
// Step 1 — When?
// -----------------------------------------------------------------------------

function WhenStep({
  value,
  onChange,
  customDate,
  onCustomDate,
}: {
  value: WhenChoice;
  onChange: (v: WhenChoice) => void;
  customDate: string;
  onCustomDate: (v: string) => void;
}) {
  const today = formatLocalYmd();
  const minDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return formatLocalYmd(d);
  })();
  return (
    <section aria-labelledby="step-when" className="space-y-2">
      <h3 id="step-when" className="text-xs uppercase tracking-wide text-neutral-500">
        When did you visit?
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {([
          ["today", "Today"],
          ["yesterday", "Yesterday"],
          ["earlier_week", "Earlier this week"],
          ["custom", "Earlier"],
        ] as const).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`rounded-xl border px-3 py-2 text-sm ${
              value === v
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
            aria-pressed={value === v}
          >
            {label}
          </button>
        ))}
      </div>
      {value === "custom" ? (
        <input
          type="date"
          value={customDate}
          max={today}
          min={minDate}
          onChange={(e) => onCustomDate(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          aria-label="Visit date"
        />
      ) : null}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Step 2 — What happened?
// -----------------------------------------------------------------------------

function WhatStep({
  value,
  onChange,
}: {
  value: ReportType | null;
  onChange: (v: ReportType) => void;
}) {
  return (
    <section aria-labelledby="step-what" className="space-y-2">
      <h3 id="step-what" className="text-xs uppercase tracking-wide text-neutral-500">
        What happened?
      </h3>
      <div className="grid grid-cols-1 gap-2">
        {REPORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm ${
              value === opt.value
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
            }`}
            aria-pressed={value === opt.value}
          >
            <span aria-hidden="true" className="font-mono">
              {opt.glyph}
            </span>
            <span>
              <span className="block">{opt.label}</span>
              {opt.hint ? (
                <span
                  className={`block text-xs mt-0.5 ${
                    value === opt.value ? "text-neutral-300" : "text-neutral-500"
                  }`}
                >
                  {opt.hint}
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Step 3 — Barriers
// -----------------------------------------------------------------------------

function BarriersStep({
  allowed,
  selected,
  required,
  costAmount,
  onCostAmount,
  onToggle,
  reportType,
}: {
  allowed: ReadonlySet<BarrierValue>;
  selected: BarrierValue[];
  required: boolean;
  costAmount: string;
  onCostAmount: (v: string) => void;
  onToggle: (b: BarrierValue) => void;
  reportType: ReportType;
}) {
  const visible = (Object.keys(BARRIER_LABEL) as BarrierValue[]).filter((b) =>
    allowed.has(b),
  );
  const heading =
    reportType === "out_of_stock" ? "Anything to flag? (optional)" : "Which barriers came up?";
  return (
    <section aria-labelledby="step-barriers" className="space-y-2">
      <h3 id="step-barriers" className="text-xs uppercase tracking-wide text-neutral-500">
        {heading}
        {required ? <span className="text-red-700"> *</span> : null}
      </h3>
      <ul className="space-y-1">
        {visible.map((b) => {
          const checked = selected.includes(b);
          return (
            <li key={b}>
              <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-neutral-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(b)}
                  className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                />
                <span className="text-sm">{BARRIER_LABEL[b]}</span>
              </label>
              {b === "cost_involved" && checked ? (
                <div className="ml-6 mt-1">
                  <label className="block text-xs text-neutral-500 mb-1">
                    How much (AUD)? optional
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1000"
                    value={costAmount}
                    onChange={(e) => onCostAmount(e.target.value)}
                    placeholder="40.00"
                    className="w-32 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Step 4 — Notes
// -----------------------------------------------------------------------------

function NotesStep({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <section aria-labelledby="step-notes" className="space-y-2">
      <h3 id="step-notes" className="text-xs uppercase tracking-wide text-neutral-500">
        Anything else? (optional)
      </h3>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="Tip, time of day, who to ask for, anything to say to the next person…"
        className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 resize-none"
      />
      <p className="text-xs text-neutral-400 text-right">{value.length} / 500</p>
    </section>
  );
}

