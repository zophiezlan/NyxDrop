import { useEffect, useRef, useState } from "react";
import { useSearchLocations } from "@/hooks/use-locations";
import { useVoiceSearch, isVoiceSearchSupported } from "@/hooks/use-voice-search";
import { formatDistanceKm } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { LocationWithConsensus } from "@shared/schema";

interface SearchBarProps {
  /** Current user position (for distance ranking). */
  geo?: { lat: number; lon: number };
  /** Voice search master toggle from settings. */
  voiceEnabled?: boolean;
  /** ISO locale for speech recognition. */
  locale?: string;
  /** When the user picks a result, the parent recentres the map + opens detail. */
  onPick: (location: LocationWithConsensus) => void;
}

export function SearchBar({ geo, voiceEnabled = true, locale, onPick }: SearchBarProps) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const voice = useVoiceSearch({
    onResult: (transcript) => {
      setQuery(transcript);
      setDebounced(transcript);
      setOpen(true);
    },
    locale,
  });

  // Debounce 200ms per spec.md §7.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const results = useSearchLocations(debounced, geo);

  const showVoiceMic = voiceEnabled && isVoiceSearchSupported();

  return (
    <div className="fixed inset-x-0 top-16 z-30 px-3 pointer-events-none">
      <div className="mx-auto max-w-md pointer-events-auto">
        <div className="flex items-center gap-2 rounded-full bg-surface px-3 shadow-lg ring-1 ring-nl-ring focus-within:ring-2 focus-within:ring-nl-primary">
          <span aria-hidden="true" className="text-fg-faint">🔍</span>
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            value={query}
            placeholder={t("search.placeholder")}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                setOpen(false);
                inputRef.current?.blur();
              }
            }}
            className="flex-1 bg-transparent py-2.5 text-sm text-fg placeholder-fg-faint focus:outline-none"
            aria-label="Search locations"
            aria-autocomplete="list"
            aria-expanded={!!(open && results.data && results.data.length > 0)}
            aria-controls="search-results"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              className="text-fg-faint hover:text-fg-secondary focus:outline-none focus:underline"
              onClick={() => {
                setQuery("");
                setDebounced("");
                inputRef.current?.focus();
              }}
            >
              ×
            </button>
          ) : null}
          {showVoiceMic ? (
            <button
              type="button"
              aria-label={voice.isListening ? t("search.voice_listening") : t("search.voice_label")}
              aria-pressed={voice.isListening}
              onClick={() => (voice.isListening ? voice.stop() : voice.start())}
              className={`rounded-full p-1.5 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-nl-primary ${
                voice.isListening ? "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 animate-pulse" : "text-fg-muted hover:text-fg"
              }`}
            >
              <span aria-hidden="true">🎙</span>
            </button>
          ) : null}
        </div>

        {open && debounced.trim().length >= 2 ? (
          <div
            id="search-results"
            role="listbox"
            className="mt-2 max-h-[60dvh] overflow-y-auto rounded-2xl bg-surface shadow-lg ring-1 ring-nl-ring"
          >
            {results.isLoading ? (
              <p className="px-3 py-3 text-sm text-fg-muted">Searching…</p>
            ) : results.data && results.data.length > 0 ? (
              <ul className="divide-y divide-nl-divider">
                {results.data.map((loc) => (
                  <li key={loc.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected="false"
                      className="block w-full px-3 py-2 text-left hover:bg-nl-hover focus:bg-nl-hover focus:outline-none"
                      onClick={() => {
                        onPick(loc);
                        setOpen(false);
                        setQuery("");
                        setDebounced("");
                      }}
                    >
                      <div className="text-sm font-medium text-fg">{loc.name}</div>
                      <div className="text-xs text-fg-muted">
                        {loc.address}
                        {loc.distance !== undefined ? ` · ${formatDistanceKm(loc.distance)}` : ""}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-3 text-sm text-fg-muted">{t("search.no_matches")}</p>
            )}
            {voice.error ? (
              <p role="alert" className="px-3 py-2 text-xs text-red-700 dark:text-red-400">
                {voice.error}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
