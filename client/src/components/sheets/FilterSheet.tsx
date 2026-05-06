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
import { useT } from "@/lib/i18n";

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

const HEADLINE_BARRIER_KEYS: BarrierValue[] = [
  "id_required",
  "medicare_required",
  "cost_involved",
  "staff_rude",
  "long_wait",
];

interface FilterSheetProps {
  value: Filters;
  onChange: (f: Filters) => void;
  onClose: () => void;
  onReset: () => void;
}

export function FilterSheet({ value, onChange, onClose, onReset }: FilterSheetProps) {
  const t = useT();
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
              {t("filter.title")}
            </h2>
            {count > 0 ? (
              <span className="rounded-full bg-surface-inset px-2 py-0.5 text-xs text-fg-secondary">
                {t("filter.count_active").replace("{count}", String(count))}
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
              {t("filter.reset")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-fg-muted hover:underline focus:outline-none focus:underline"
            >
              {t("actions.close")}
            </button>
          </div>
        </header>

        <Section
          title={t("filter.headline_title")}
          subtitle={t("filter.headline_subtitle")}
        >
          <ul className="space-y-1">
            {HEADLINE_BARRIER_KEYS.map((barrier) => (
              <li key={barrier}>
                <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-nl-hover cursor-pointer">
                  <input
                    type="checkbox"
                    checked={value.hideBarriers.includes(barrier)}
                    onChange={() => togglesetItem("hideBarriers", barrier)}
                    className="h-4 w-4 rounded border-nl-border-input text-nl-primary focus:ring-nl-primary"
                  />
                  <span className="text-sm">{t(`filter.barrier_${barrier}`)}</span>
                </label>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t("filter.location_type")}>
          <div className="flex flex-wrap gap-2">
            {LOCATION_TYPES.map((lt) => (
              <Chip
                key={lt}
                active={value.type.includes(lt)}
                onClick={() => togglesetItem("type", lt)}
              >
                {t(`filter.type_${lt}`)}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title={t("filter.verification")}>
          <div className="flex flex-wrap gap-2">
            {VERIFICATION_LEVELS.map((v) => (
              <Chip
                key={v}
                active={value.verification.includes(v)}
                onClick={() => togglesetItem("verification", v)}
              >
                {t(`filter.verification_${v}`)}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title={t("filter.naloxone_form")}>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["any", "filter.naloxone_any"],
                ["nasal_spray", "filter.naloxone_nasal"],
                ["injectable", "filter.naloxone_injectable"],
              ] as const
            ).map(([v, key]) => (
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
                {t(key)}
              </button>
            ))}
          </div>
        </Section>

        <Section title={t("filter.status")}>
          <div className="space-y-1">
            <Toggle
              checked={value.recent}
              onChange={(b) => onChange({ ...value, recent: b })}
              label={t("filter.recent_only")}
            />
            <Toggle
              checked={value.openNow}
              onChange={(b) => onChange({ ...value, openNow: b })}
              label={t("filter.open_now")}
            />
          </div>
        </Section>

        <Section title={t("filter.accessibility")}>
          <div className="flex flex-wrap gap-2">
            {LOCATION_TAGS.map((tag) => (
              <Chip
                key={tag}
                active={value.tags.includes(tag)}
                onClick={() => togglesetItem("tags", tag)}
              >
                {t(`filter.tag_${tag}`)}
              </Chip>
            ))}
          </div>
        </Section>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-nl-primary px-3 py-3 text-sm font-medium text-nl-on-primary hover:bg-nl-primary-hover active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-nl-primary transition-transform"
        >
          {t("filter.done")}
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
          className={`absolute top-0.5 start-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
          aria-hidden="true"
        />
      </button>
    </label>
  );
}
