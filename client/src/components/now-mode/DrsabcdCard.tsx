import { useState } from "react";

interface Step {
  letter: string;
  short: string;
  long: string;
}

const STEPS: Step[] = [
  { letter: "D", short: "Danger", long: "Check the scene is safe before approaching." },
  {
    letter: "R",
    short: "Response",
    long: "Tap shoulder and ask loudly: \"Are you OK?\"",
  },
  {
    letter: "S",
    short: "Send for help",
    long: "Call 000. Stay on the line.",
  },
  {
    letter: "A",
    short: "Airway",
    long: "Clear the airway. Tilt head back; check the mouth.",
  },
  {
    letter: "B",
    short: "Breathing",
    long: "Look, listen, feel for normal breathing. If absent, give rescue breaths.",
  },
  {
    letter: "C",
    short: "Compressions",
    long: "If no pulse, start CPR — 30 compressions, 2 breaths, repeat.",
  },
  { letter: "D", short: "Defibrillator", long: "Use an AED if one is available." },
];

/**
 * The Australian first-aid framework, always visible in Now mode (spec §4.3).
 * Steps expand on tap. Naloxone goes in alongside this — typically after
 * airway is clear.
 */
export function DrsabcdCard() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <aside
      role="region"
      aria-label="DRSABCD first aid steps"
      className="fixed inset-x-3 bottom-[max(env(safe-area-inset-bottom,12px),12px)] z-30 max-h-[40dvh] overflow-y-auto rounded-2xl border border-red-200 dark:border-red-800 bg-surface px-3 py-3 text-sm shadow-xl"
    >
      <ol className="space-y-1">
        {STEPS.map((step, i) => (
          <li key={`${step.letter}-${i}`}>
            <button
              type="button"
              className="flex w-full items-start gap-3 rounded-md px-1 py-1 text-start hover:bg-nl-hover focus:outline-none focus:bg-nl-hover"
              aria-expanded={open === i}
              onClick={() => setOpen(open === i ? null : i)}
            >
              <span
                aria-hidden="true"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 dark:bg-red-900 text-base font-semibold text-red-800 dark:text-red-200"
              >
                {step.letter}
              </span>
              <span className="flex-1 self-center">
                <span className="font-medium">{step.short}</span>
                {open === i ? (
                  <span className="block text-xs text-fg-secondary mt-0.5">
                    {step.long}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-2 border-t border-nl-divider pt-2 text-xs text-fg-muted">
        Naloxone is given alongside these steps, typically after the airway is clear.
      </p>
    </aside>
  );
}
