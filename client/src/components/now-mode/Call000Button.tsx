/**
 * The single most prominent thing on screen in Now mode (constitution III,
 * spec.md §4.1). Paramedics carry naloxone — statistically the fastest path.
 */
export function Call000Button() {
  return (
    <a
      href="tel:000"
      role="button"
      aria-label="Call 000 emergency services"
      className="fixed inset-x-3 top-3 z-40 flex h-14 items-center justify-center rounded-2xl bg-red-700 px-4 text-lg font-semibold text-white shadow-xl ring-1 ring-red-800 hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-700"
    >
      <span aria-hidden="true" className="mr-2">📞</span>
      Call 000
    </a>
  );
}
