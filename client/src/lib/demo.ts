// Single source of truth for the prototype/demo-data disclaimers shown across
// the app. Read in lockstep with the i18n keys under `demo.*` — flipping the
// flag off removes every banner in one place.
//
// Default ON: the seeded dataset contains realistic-but-fabricated reports
// attached to real organisation names, so the disclaimers must be present
// unless something explicitly opts out (e.g. a future production build with
// VITE_DEMO_MODE=false).

const raw = (import.meta.env.VITE_DEMO_MODE ?? "true").toString().toLowerCase();
export const IS_DEMO: boolean = raw !== "false" && raw !== "0" && raw !== "off";
