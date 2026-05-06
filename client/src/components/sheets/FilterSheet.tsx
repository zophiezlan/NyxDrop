import { useEffect, useRef } from "react";
import {
  LOCATION_TAGS,
  LOCATION_TYPES,
  VERIFICATION_LEVELS,
  type BarrierValue,
  type LocationTag,
  type LocationType,
  type VerificationLevel,
} from "@shared/schema";

export interface Filters {
  type: LocationType[];
  verification: VerificationLevel[];
  naloxoneForm: "any" | "nasal_spray" | "injectable";
  recent: boolean;
  openNow: boolean;
  hideBarriers: BarrierValue[];
  tags: LocationTag[];
}

export const EMPTY_FILTERS: Filters = {
  type: [],
  verification: [],
  naloxoneForm: "any",
  recent: false,
  openNow: false,
  hideBarriers: [],
  tags: [],
};

export function activeFilterCount(f: Filters): number {
  return (
    f.type.length +
    f.verification.length +
    (f.naloxoneForm !== "any" ? 1 : 0) +
    (f.recent ? 1 : 0) +
    (f.openNow ? 1 : 0) +
    f.hideBarriers.length +
    f.tags.length
  );
}

const TYPE_LABELS: Record<LocationType, string> = {
  nsp: "NSP",
  pharmacy: "Pharmacy",
  hospital: "Hospital",
  community_health: "Community health",
  aod_organisation: "AOD",
  library: "Library",
  public_building: "Public building",
  festival_site: "Festival",
  drop_in_centre: "Drop-in",
  other: "Other",
};

const VERIFICATION_LABELS: Record<VerificationLevel, string> = {
  unverified: "Unverified",
  community_verified: "Community verified",
  official: "Official partner",
};

const TAG_LABELS: Record<LocationTag, string> = {
  wheelchair_accessible: "Wheelchair accessible",
  no_id_required: "No ID required",
  bulk_available: "Bulk available",
  open_24_7: "Open 24/7",
  confidential: "Confidential",
  peer_support: "Peer support",
  emergency_available: "Emergency available",
};

const HEADLINE_BARRIERS: { barrier: BarrierValue; label: string }[] = [
  { barrier: "id_required", label: "Hide places where ID was asked recently" },
  {
    barrier: "medicare_required",
    label: "Hide places where Medicare was required recently",
  },
  { barrier: "cost_involved", label: "Hide places that charged recently" },
  { barrier: "staff_rude", label: "Hide places where staff were rude recently" },
  { barrier: "long_wait", label: "Hide places that took long recently" },
];

interface FilterSheetProps {
  value: Filters;
  onChange: (f: Filters) => void;
  onClose: () => void;
  onReset: () => void;
}

export function FilterSheet({ value, onChange, onClose, onReset }: FilterSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sheetRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const count = activeFilterCount(value);

  const togglesetItem = <K extends keyof Filters>(
    key: K,
    item: Filters[K] extends Array<infer T> ? T : never,
  ) => {
    const list = value[key] as unknown as Array<typeof item>;
    const next = list.includes(item)
      ? list.filter((x) => x !== item)
      : [...list, item];
    onChange({ ...value, [key]: next as unknown as Filters[K] });
  };

  return (
    <aside
      ref={sheetRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-labelledby="filter-title"
      className="fixed inset-x-0 bottom-0 z-30 max-h-[90dvh] overflow-y-auto rounded-t-2xl border-t border-nl-border bg-surface shadow-2xl outline-none animate-sheet-up"
    >
      <div className="flex justify-center pt-2">
        <div className="h-1 w-10 rounded-full bg-fg-faint/40" aria-hidden="true" />
      </div>

      <div className="px-5 pt-3 pb-8 text-fg space-y-6">
        <header className="flex items-start justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h2 id="filter-title" className="text-lg font-semibold">
              Filters
            </h2>
            {count > 0 ? (
              <span className="rounded-full bg-surface-inset px-2 py-0.5 text-xs text-fg-secondary">
                {count} active
              </span>
            ) : null}
          </div>
          <div className="flex gap-3 text-sm">
            <button
              type="button"
              onClick={onReset}
              className="text-fg-muted hover:underline focus:outline-none focus:underline disabled:opacity-50"
              disabled={count === 0}
            >
              Reset
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-fg-muted hover:underline focus:outline-none focus:underline"
            >
              Close
            </button>
          </div>
        </header>

        <Section
          title="Avoid known soft barriers"
          subtitle="Hide places that recent visitors frequently flagged"
        >
          <ul className="space-y-1">
            {HEADLINE_BARRIERS.map(({ barrier, label }) => (
              <li key={barrier}>
                <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-nl-hover cursor-pointer">
                  <input
                    type="checkbox"
                    checked={value.hideBarriers.includes(barrier)}
                    onChange={() => togglesetItem("hideBarriers", barrier)}
                    className="h-4 w-4 rounded border-nl-border-input text-nl-primary focus:ring-nl-primary"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Location type">
          <div className="flex flex-wrap gap-2">
            {LOCATION_TYPES.map((t) => (
              <Chip
                key={t}
                active={value.type.includes(t)}
                onClick={() => togglesetItem("type", t)}
              >
                {TYPE_LABELS[t]}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title="Verification">
          <div className="flex flex-wrap gap-2">
            {VERIFICATION_LEVELS.map((v) => (
              <Chip
                key={v}
                active={value.verification.includes(v)}
                onClick={() => togglesetItem("verification", v)}
              >
                {VERIFICATION_LABELS[v]}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title="Naloxone form">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["any", "Any"],
                ["nasal_spray", "Nasal spray"],
                ["injectable", "Injectable"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => onChange({ ...value, naloxoneForm: v })}
                aria-pressed={value.naloxoneForm === v}
                className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
                  value.naloxoneForm === v
                    ? "border-nl-primary bg-nl-primary text-nl-on-primary"
                    : "border-nl-border-input bg-surface text-fg-secondary hover:bg-nl-hover"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Status">
          <div className="space-y-1">
            <Toggle
              checked={value.recent}
              onChange={(b) => onChange({ ...value, recent: b })}
              label="Only recently reported (last 7 days)"
            />
            <Toggle
              checked={value.openNow}
              onChange={(b) => onChange({ ...value, openNow: b })}
              label="Open now"
            />
          </div>
        </Section>

        <Section title="Accessibility">
          <div className="flex flex-wrap gap-2">
            {LOCATION_TAGS.map((t) => (
              <Chip
                key={t}
                active={value.tags.includes(t)}
                onClick={() => togglesetItem("tags", t)}
              >
                {TAG_LABELS[t]}
              </Chip>
            ))}
          </div>
        </Section>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-nl-primary px-3 py-3 text-sm font-medium text-nl-on-primary hover:bg-nl-primary-hover active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nl-primary transition-transform"
        >
          Done
        </button>
      </div>
    </aside>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wide text-fg-muted">{title}</h3>
      {subtitle ? <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p> : null}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
        active
          ? "border-nl-primary bg-nl-primary text-nl-on-primary"
          : "border-nl-border-input bg-surface text-fg-secondary hover:bg-nl-hover"
      }`}
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-nl-hover cursor-pointer">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          checked ? "bg-nl-primary" : "bg-fg-faint"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
          aria-hidden="true"
        />
      </button>
    </label>
  );
}
