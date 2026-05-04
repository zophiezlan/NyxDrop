import { Suspense, lazy } from "react";
import { Route, Switch } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const MapRoute = lazy(() => import("./routes/map.js"));
const AboutRoute = lazy(() => import("./routes/about.js"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 60_000,
    },
  },
});

function MapLoading() {
  return (
    <div className="min-h-dvh flex items-center justify-center text-sm text-neutral-500">
      Loading the map…
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<MapLoading />}>
        <Switch>
          <Route path="/about" component={AboutRoute} />
          <Route path="/m/:id">{(params) => <MapRoute openSheet="detail" sheetId={params.id} />}</Route>
          <Route path="/r/:id">{(params) => <MapRoute openSheet="report" sheetId={params.id} />}</Route>
          <Route path="/me">
            <MapRoute openSheet="my-places" />
          </Route>
          <Route path="/emergency">
            <MapRoute forceMode="now" />
          </Route>
          <Route path="/">
            <MapRoute />
          </Route>
          <Route>
            <MapRoute />
          </Route>
        </Switch>
      </Suspense>
    </QueryClientProvider>
  );
}
