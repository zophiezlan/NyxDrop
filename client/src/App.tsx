import { Suspense, lazy } from "react";
import { Route, Switch, useLocation, useRoute } from "wouter";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { PERSIST_MAX_AGE, queryClient, queryPersister } from "@/lib/query-client";

const MapRoute = lazy(() => import("./routes/map.js"));
const AboutRoute = lazy(() => import("./routes/about.js"));
const GuardianLoginRoute = lazy(() => import("./routes/guardian/login.js"));
const GuardianDashboardRoute = lazy(() => import("./routes/guardian/dashboard.js"));

function MapLoading() {
  return (
    <div className="min-h-dvh flex items-center justify-center text-sm text-fg-muted bg-surface-dim">
      Loading the map…
    </div>
  );
}

/**
 * Single-mount MapRoute wrapper — reads the URL itself so wouter never has to
 * unmount/remount it when the user navigates between `/`, `/m/:id`, `/r/:id`,
 * `/me`, and `/emergency`. Keeping the same React tree across these routes
 * preserves transient state like toasts and selected-pin focus.
 */
function MapRouteHost() {
  const [path] = useLocation();
  const [matchM, paramsM] = useRoute("/m/:id");
  const [matchR, paramsR] = useRoute("/r/:id");

  if (matchM && paramsM?.id) {
    return <MapRoute openSheet="detail" sheetId={paramsM.id} />;
  }
  if (matchR && paramsR?.id) {
    return <MapRoute openSheet="report" sheetId={paramsR.id === "new" ? undefined : paramsR.id} />;
  }
  if (path === "/me") {
    return <MapRoute openSheet="my-places" />;
  }
  if (path === "/emergency") {
    return <MapRoute forceMode="now" />;
  }
  return <MapRoute />;
}

export function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: PERSIST_MAX_AGE,
        // Only persist queries we actually want to survive reloads.
        // Locations tiles get persisted; ephemeral things (pending reports,
        // search results) are explicitly excluded.
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => {
            const key = q.queryKey[0];
            return key === "locations" || key === "location";
          },
        },
      }}
    >
      <Suspense fallback={<MapLoading />}>
        <Switch>
          <Route path="/about" component={AboutRoute} />
          <Route path="/guardian/dashboard" component={GuardianDashboardRoute} />
          <Route path="/guardian" component={GuardianLoginRoute} />
          <Route>
            <MapRouteHost />
          </Route>
        </Switch>
      </Suspense>
    </PersistQueryClientProvider>
  );
}
