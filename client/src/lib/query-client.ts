import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { del, get, set } from "idb-keyval";

// Bump when the shape of cached data changes incompatibly (e.g. a field
// type changes on LocationWithConsensus). Sets a fresh buster string so
// old persisted caches are silently dropped on first load.
const CACHE_VERSION = "v1";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale-while-revalidate window. Within this period we serve from
      // cache without hitting the network; after it elapses we still
      // serve from cache instantly but kick off a background refetch.
      staleTime: 5 * 60 * 1000,
      // Keep entries in-memory for an hour even when no component is
      // subscribed; the IndexedDB persister takes over after that.
      gcTime: 60 * 60 * 1000,
      // Returning to the tab triggers a background refetch of stale
      // queries — the gentle freshness path for "places change" without
      // any polling.
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

export const queryPersister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get<string>(key).then((v) => v ?? null),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: `nyxdrop-query-cache:${CACHE_VERSION}`,
  // Persisted entries older than this are discarded on restore.
  throttleTime: 1000,
});

export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;
