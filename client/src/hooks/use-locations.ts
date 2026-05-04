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
}

export function useLocations(params: LocationsQueryParams = {}) {
  return useQuery({
    queryKey: ["locations", params],
    queryFn: ({ signal }) =>
      api<LocationWithConsensus[]>("/api/locations", {
        signal,
        query: {
          lat: params.lat,
          lon: params.lon,
          bbox: params.bbox
            ? `${params.bbox.swLat},${params.bbox.swLon},${params.bbox.neLat},${params.bbox.neLon}`
            : undefined,
          type: params.type,
          verification: params.verification,
          recent: params.recent,
          openNow: params.openNow,
        },
      }),
    staleTime: 60_000,
  });
}

export function useLocation(id: string | null, geo?: { lat: number; lon: number }) {
  return useQuery({
    queryKey: ["location", id, geo],
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
