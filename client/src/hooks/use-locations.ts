import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "@/lib/api";
import { tileBbox, tileKey, type TileCoord } from "@/lib/tiles";
import type { LocationWithConsensus } from "@shared/schema";

export interface LocationsFilterParams {
  type?: string[];
  verification?: string[];
  recent?: boolean;
  openNow?: boolean;
}

/** Stable serialised key for the server-side filter portion of a tile
 *  query. We include it in every tile's queryKey so flipping a filter
 *  produces a distinct cache slot per (filter × tile) instead of polluting
 *  the previous filter's data. */
function filterKey(f: LocationsFilterParams): string {
  return [
    f.type?.join(",") ?? "",
    f.verification?.join(",") ?? "",
    f.recent ? "1" : "0",
    f.openNow ? "1" : "0",
  ].join("|");
}

function fetchTile(
  tile: TileCoord,
  filters: LocationsFilterParams,
  signal: AbortSignal,
): Promise<LocationWithConsensus[]> {
  const b = tileBbox(tile);
  return api<LocationWithConsensus[]>("/api/locations", {
    signal,
    query: {
      bbox: `${b.swLat},${b.swLon},${b.neLat},${b.neLon}`,
      type: filters.type,
      verification: filters.verification,
      recent: filters.recent,
      openNow: filters.openNow,
    },
  });
}

/**
 * Fetches a set of XYZ map tiles in parallel, each independently cached
 * under `["locations", "tile", filterKey, z, x, y]`. Tile queries stick
 * around in the cache (gcTime is generous) so re-visiting an area is
 * instant; on the next visit React Query serves the cached data and —
 * if the tile is older than `staleTime` — quietly refetches in the
 * background.
 *
 * Pass an empty array (or one that becomes empty after the user resets
 * the viewport) and nothing fetches. The hook tolerates the active tile
 * set growing or shrinking between renders.
 */
export function useLocationsByTiles(
  tiles: TileCoord[],
  filters: LocationsFilterParams,
) {
  const fk = filterKey(filters);
  // Stable list so React Query's internal observer doesn't churn on
  // every parent render.
  const stableTiles = useMemo(() => {
    return [...tiles].sort((a, b) =>
      tileKey(a).localeCompare(tileKey(b)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles.map(tileKey).join("|")]);

  return useQueries({
    queries: stableTiles.map((tile) => ({
      queryKey: ["locations", "tile", fk, tile.z, tile.x, tile.y] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchTile(tile, filters, signal),
    })),
    combine: (results) => {
      const byId = new Map<string, LocationWithConsensus>();
      let isFetching = false;
      let isError = false;
      for (const r of results) {
        if (r.isFetching) isFetching = true;
        if (r.isError) isError = true;
        if (r.data) for (const loc of r.data) byId.set(loc.id, loc);
      }
      return { byId, isFetching, isError };
    },
  });
}

/**
 * `geo` is intentionally not part of the cache key: distance is an
 * informational field that the client recomputes from the user's current
 * position. Including it would refetch the detail on every position update
 * and prevent reopening a recently-viewed pin from hitting the cache.
 */
export function useLocation(id: string | null, geo?: { lat: number; lon: number }) {
  return useQuery({
    queryKey: ["location", id],
    queryFn: ({ signal }) =>
      api<LocationWithConsensus>(`/api/locations/${id}`, {
        signal,
        query: { lat: geo?.lat, lon: geo?.lon },
      }),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useSearchLocations(
  query: string,
  geo?: { lat: number; lon: number },
) {
  return useQuery({
    queryKey: ["locations-search", query, geo],
    queryFn: ({ signal }) =>
      api<LocationWithConsensus[]>("/api/locations/search", {
        signal,
        query: { q: query, lat: geo?.lat, lon: geo?.lon, limit: 20 },
      }),
    enabled: query.trim().length > 0,
    staleTime: 30_000,
  });
}
