interface BottomActionBarProps {
  onIWentHere: () => void;
  onAddPlace: () => void;
  /** Hidden if the user is in Now mode — Phase 5 will pass this through. */
  hidden?: boolean;
}

/**
 * The persistent bottom action bar in Plan mode (spec.md §3.3). Filters land
 * in Phase 5 — this Phase 2 version ships the two write-path entry points.
 */
export function BottomActionBar({ onIWentHere, onAddPlace, hidden }: BottomActionBarProps) {
  if (hidden) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 pointer-events-none">
      <div className="mx-auto flex max-w-md gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={onIWentHere}
          className="flex-1 rounded-xl bg-neutral-900 px-3 py-3 text-sm font-medium text-white shadow-lg hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900"
        >
          ⊕ I went here
        </button>
        <button
          type="button"
          onClick={onAddPlace}
          className="flex-1 rounded-xl bg-white px-3 py-3 text-sm font-medium text-neutral-900 shadow-lg ring-1 ring-neutral-200 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900"
        >
          ✚ Add a place
        </button>
      </div>
    </div>
  );
}
