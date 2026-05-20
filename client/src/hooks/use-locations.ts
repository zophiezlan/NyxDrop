import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { LocationWithConsensus } from "@shared/schema";

export interface LocationsQueryParams {
  lat?: number;
  lon?: number;
  bbox?: { swLat: number; swLon: number; neLat: number; neLon: number };
  type?: string[];
  verification?: string[];
  recent?: boolean;
  openNow?: boolean;
  /** Set false to suppress fetching until upstream state is ready. */
  enabled?: boolean;
}

export function useLocations(params: LocationsQueryParams = {}) {
  const { enabled = true, ...rest } = params;
  return useQuery({
    queryKey: ["locations", rest],
    queryFn: ({ signal }) =>
      api<LocationWithConsensus[]>("/api/locations", {
        signal,
        query: {
          lat: rest.lat,
          lon: rest.lon,
          bbox: rest.bbox
            ? `${rest.bbox.swLat},${rest.bbox.swLon},${rest.bbox.neLat},${rest.bbox.neLon}`
            : undefined,
          type: rest.type,
          verification: rest.verification,
          recent: rest.recent,
          openNow: rest.openNow,
        },
      }),
    enabled,
    staleTime: 60_000,
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
