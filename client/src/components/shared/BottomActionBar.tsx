import { useT } from "@/lib/i18n";

interface BottomActionBarProps {
  onIWentHere: () => void;
  onAddPlace: () => void;
  onFilters: () => void;
  /** Number of active filters (rendered as a small badge on the Filters button). */
  activeFilterCount?: number;
  /** Hidden when a sheet is open or in Now mode. */
  hidden?: boolean;
}

/**
 * The persistent bottom action bar in Plan mode (spec.md §3.3).
 */
export function BottomActionBar({
  onIWentHere,
  onAddPlace,
  onFilters,
  activeFilterCount = 0,
  hidden,
}: BottomActionBarProps) {
  const t = useT();
  if (hidden) return null;
  const filtersLabel =
    activeFilterCount > 0
      ? t("actions.filters_active").replace("{count}", String(activeFilterCount))
      : t("actions.filters");
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 pointer-events-none">
      <div className="mx-auto flex max-w-md gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={onIWentHere}
          className="flex-1 rounded-xl bg-neutral-900 px-3 py-3 text-sm font-medium text-white shadow-lg hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900"
        >
          ⊕ {t("actions.i_went_here")}
        </button>
        <button
          type="button"
          onClick={onAddPlace}
          className="flex-1 rounded-xl bg-white px-3 py-3 text-sm font-medium text-neutral-900 shadow-lg ring-1 ring-neutral-200 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900"
        >
          ✚ {t("actions.add_a_place")}
        </button>
        <button
          type="button"
          onClick={onFilters}
          aria-label={filtersLabel}
          className="relative w-12 rounded-xl bg-white px-3 py-3 text-sm font-medium text-neutral-900 shadow-lg ring-1 ring-neutral-200 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900"
        >
          ⚙
          {activeFilterCount > 0 ? (
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-xs font-semibold text-white"
            >
              {activeFilterCount}
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
