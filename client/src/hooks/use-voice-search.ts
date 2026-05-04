import { useCallback, useEffect, useRef, useState } from "react";

// SpeechRecognition is webkit-prefixed in Safari; standard in Chrome/Edge.
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: { [i: number]: { [i: number]: { transcript: string } } } }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isVoiceSearchSupported(): boolean {
  return getRecognitionCtor() !== null;
}

/**
 * Web Speech API wrapper. Only mounted when supported (callers check
 * `isVoiceSearchSupported()` first); the mic icon is hidden otherwise per
 * spec.md §7.
 */
export function useVoiceSearch(options: {
  onResult: (transcript: string) => void;
  locale?: string;
}): {
  isListening: boolean;
  start: () => void;
  stop: () => void;
  error: string | null;
} {
  const onResultRef = useRef(options.onResult);
  onResultRef.current = options.onResult;

  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // No-op: stopping an already-stopped recognition throws.
        }
      }
    };
  }, []);

  const start = useCallback(() => {
    setError(null);
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("Voice search is not supported on this browser.");
      return;
    }
    const rec = new Ctor();
    rec.lang = options.locale ?? "en-AU";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (event) => {
      const first = event.results[0];
      const alt = first?.[0];
      if (alt?.transcript) onResultRef.current(alt.transcript);
    };
    rec.onerror = (e) => {
      setError(e.error ?? "Voice search failed.");
    };
    rec.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = rec;
    setIsListening(true);
    rec.start();
  }, [options.locale]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // No-op.
      }
    }
  }, []);

  return { isListening, start, stop, error };
}
