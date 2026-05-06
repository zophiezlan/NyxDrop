import { useEffect, useRef } from "react";
import {
  isLocaleReady,
  LOCALES,
  LOCALE_LABELS,
  useT,
  type Locale,
} from "@/lib/i18n";
import {
  type AppPreferences,
  type Theme,
} from "@/hooks/use-app-preferences";
import { isVoiceSearchSupported } from "@/hooks/use-voice-search";
import { useWatches } from "@/hooks/use-watches";

interface SettingsSheetProps {
  preferences: AppPreferences;
  onChange: (prefs: AppPreferences) => void;
  onClose: () => void;
  onForgetDevice: () => void;
}

export function SettingsSheet({
  preferences,
  onChange,
  onClose,
  onForgetDevice,
}: SettingsSheetProps) {
  const t = useT();
  const sheetRef = useRef<HTMLDivElement>(null);
  const watches = useWatches();
  const hasActiveWatches = (watches.data?.length ?? 0) > 0;

  useEffect(() => {
    sheetRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const update = <K extends keyof AppPreferences>(
    key: K,
    value: AppPreferences[K],
  ) => {
    onChange({ ...preferences, [key]: value });
  };

  const voiceSupported = isVoiceSearchSupported();

  return (
    <aside
      ref={sheetRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-labelledby="settings-title"
      className="fixed inset-x-0 bottom-0 z-30 max-h-[90dvh] overflow-y-auto rounded-t-2xl border-t border-nl-border bg-surface shadow-2xl outline-none animate-sheet-up"
    >
      <div className="flex justify-center pt-2">
        <div className="h-1 w-10 rounded-full bg-fg-faint/40" aria-hidden="true" />
      </div>

      <div className="px-5 pt-3 pb-8 text-fg space-y-6">
        <header className="flex items-start justify-between gap-3">
          <h2 id="settings-title" className="text-lg font-semibold">
            {t("settings.title")}
          </h2>
          <button
            type="button"
            className="rounded-md text-sm text-fg-muted hover:text-fg focus:outline-none focus:underline"
            onClick={onClose}
            aria-label={t("actions.close")}
          >
            {t("actions.close")}
          </button>
        </header>

        <Section title={t("settings.display")}>
          <Field label={t("settings.language")}>
            <select
              value={preferences.locale}
              onChange={(e) => update("locale", e.target.value as Locale)}
              className="w-full rounded-xl border border-nl-border-input bg-surface px-3 py-2 text-sm focus:border-nl-primary focus:outline-none focus:ring-1 focus:ring-nl-primary"
            >
              {LOCALES.map((loc) => (
                <option key={loc} value={loc}>
                  {LOCALE_LABELS[loc]}
                  {!isLocaleReady(loc) ? " ⟨beta⟩" : ""}
                </option>
              ))}
            </select>
            {!isLocaleReady(preferences.locale) ? (
              <p className="mt-1 text-xs text-fg-muted">
                This translation is in beta. Strings fall back to English until a
                community translator has reviewed them.
              </p>
            ) : null}
          </Field>

          <Field label={t("settings.theme")}>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["light", "settings.theme_light"],
                  ["dark", "settings.theme_dark"],
                  ["system", "settings.theme_system"],
                ] as const
              ).map(([v, key]) => (
                <SegBtn
                  key={v}
                  active={preferences.theme === v}
                  onClick={() => update("theme", v as Theme)}
                >
                  {t(key)}
                </SegBtn>
              ))}
            </div>
          </Field>

          <Field label={`${t("settings.font_size")} — ${preferences.fontSize}px`}>
            <input
              type="range"
              min={12}
              max={24}
              step={1}
              value={preferences.fontSize}
              onChange={(e) => update("fontSize", Number.parseInt(e.target.value, 10))}
              className="w-full"
              aria-valuemin={12}
              aria-valuemax={24}
              aria-valuenow={preferences.fontSize}
            />
            <div className="flex justify-between text-xs text-fg-muted">
              <span>12</span>
              <span>16</span>
              <span>24</span>
            </div>
          </Field>

          <ToggleRow
            label={t("settings.high_contrast")}
            checked={preferences.highContrast}
            onChange={(b) => update("highContrast", b)}
          />
          <ToggleRow
            label={t("settings.reduced_motion")}
            description="Disables all animations and transitions"
            checked={preferences.reducedMotion}
            onChange={(b) => update("reducedMotion", b)}
          />
        </Section>

        {voiceSupported ? (
          <Section title={t("settings.input")}>
            <ToggleRow
              label={t("settings.voice_search")}
              checked={preferences.voiceSearchEnabled}
              onChange={(b) => update("voiceSearchEnabled", b)}
            />
          </Section>
        ) : null}

        {hasActiveWatches ? (
          <Section title={t("settings.notifications")}>
            <ToggleRow
              label={t("settings.notify_status_change")}
              checked={preferences.notifyWatchStatusChange}
              onChange={(b) => update("notifyWatchStatusChange", b)}
            />
            <ToggleRow
              label={t("settings.notify_guardian_note")}
              checked={preferences.notifyWatchGuardianNote}
              onChange={(b) => update("notifyWatchGuardianNote", b)}
            />
            <ToggleRow
              label={t("settings.notify_region")}
              description={t("settings.notify_region_disabled_hint")}
              checked={preferences.notifyRegionNewPlaces}
              onChange={(b) => update("notifyRegionNewPlaces", b)}
              disabled
            />
          </Section>
        ) : null}

        <Section title="About">
          <a
            href="/about"
            className="block rounded-lg px-1 py-1 text-sm text-blue-700 dark:text-blue-400 hover:underline focus:outline-none focus:underline"
          >
            {t("settings.about_link")} →
          </a>
          <button
            type="button"
            onClick={onForgetDevice}
            className="mt-2 block w-full rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-3 py-2.5 text-sm text-red-800 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-700 active:scale-[0.97] transition-transform"
          >
            {t("settings.forget_link")}
          </button>
        </Section>
      </div>
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs uppercase tracking-wide text-fg-muted">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-fg-secondary mb-1">{label}</span>
      {children}
    </label>
  );
}

function SegBtn({
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
      className={`rounded-xl border px-3 py-2 text-sm ${
        active
          ? "bg-nl-primary text-nl-on-primary border-nl-primary"
          : "border-nl-border-input bg-surface text-fg-secondary hover:bg-nl-hover"
      }`}
    >
      {children}
    </button>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (b: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start justify-between gap-3 rounded-lg px-1 py-2 ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      }`}
    >
      <span>
        <span className="block text-sm">{label}</span>
        {description ? (
          <span className="block text-xs text-fg-muted">{description}</span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          checked ? "bg-nl-primary" : "bg-fg-faint"
        } disabled:cursor-not-allowed`}
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
