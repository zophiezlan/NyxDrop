import { useEffect, useRef } from "react";
import {
  isLocaleReady,
  LOCALES,
  LOCALE_LABELS,
  type Locale,
} from "@/lib/i18n";
import {
  type AppPreferences,
  type Theme,
} from "@/hooks/use-app-preferences";
import { isVoiceSearchSupported } from "@/hooks/use-voice-search";

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
  const sheetRef = useRef<HTMLDivElement>(null);

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
      className="fixed inset-x-0 bottom-0 z-30 max-h-[90dvh] overflow-y-auto rounded-t-2xl border-t bg-white shadow-2xl outline-none"
    >
      <div className="flex justify-center pt-2">
        <div className="h-1 w-10 rounded-full bg-neutral-300" aria-hidden="true" />
      </div>

      <div className="px-5 pt-3 pb-8 text-neutral-900 space-y-6">
        <header className="flex items-start justify-between gap-3">
          <h2 id="settings-title" className="text-lg font-semibold">
            Settings
          </h2>
          <button
            type="button"
            className="rounded-md text-sm text-neutral-500 hover:text-neutral-900 focus:outline-none focus:underline"
            onClick={onClose}
            aria-label="Close"
          >
            Close
          </button>
        </header>

        <Section title="Display">
          <Field label="Language">
            <select
              value={preferences.locale}
              onChange={(e) => update("locale", e.target.value as Locale)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            >
              {LOCALES.map((loc) => (
                <option key={loc} value={loc}>
                  {LOCALE_LABELS[loc]}
                  {!isLocaleReady(loc) ? " ⟨beta⟩" : ""}
                </option>
              ))}
            </select>
            {!isLocaleReady(preferences.locale) ? (
              <p className="mt-1 text-xs text-neutral-500">
                This translation is in beta. Strings fall back to English until a
                community translator has reviewed them.
              </p>
            ) : null}
          </Field>

          <Field label="Theme">
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["light", "Light"],
                  ["dark", "Dark"],
                  ["system", "System"],
                ] as const
              ).map(([v, label]) => (
                <SegBtn
                  key={v}
                  active={preferences.theme === v}
                  onClick={() => update("theme", v as Theme)}
                >
                  {label}
                </SegBtn>
              ))}
            </div>
          </Field>

          <Field label={`Font size — ${preferences.fontSize}px`}>
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
            <div className="flex justify-between text-xs text-neutral-500">
              <span>12</span>
              <span>16</span>
              <span>24</span>
            </div>
          </Field>

          <ToggleRow
            label="High contrast"
            checked={preferences.highContrast}
            onChange={(b) => update("highContrast", b)}
          />
          <ToggleRow
            label="Reduced motion"
            description="Disables all animations and transitions"
            checked={preferences.reducedMotion}
            onChange={(b) => update("reducedMotion", b)}
          />
        </Section>

        {voiceSupported ? (
          <Section title="Input">
            <ToggleRow
              label="Voice search"
              checked={preferences.voiceSearchEnabled}
              onChange={(b) => update("voiceSearchEnabled", b)}
            />
          </Section>
        ) : null}

        <Section title="About">
          <a
            href="/about"
            className="block rounded-lg px-1 py-1 text-sm text-blue-700 hover:underline focus:outline-none focus:underline"
          >
            About this app →
          </a>
          <button
            type="button"
            onClick={onForgetDevice}
            className="mt-2 block w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-700"
          >
            Forget this device
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
      <h3 className="text-xs uppercase tracking-wide text-neutral-500">{title}</h3>
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
      <span className="block text-sm font-medium text-neutral-700 mb-1">{label}</span>
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
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
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
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-lg px-1 py-2 cursor-pointer">
      <span>
        <span className="block text-sm">{label}</span>
        {description ? (
          <span className="block text-xs text-neutral-500">{description}</span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          checked ? "bg-neutral-900" : "bg-neutral-300"
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
