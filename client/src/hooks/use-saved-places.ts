import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface SavedPlaceRow {
  id: string;
  locationId: string;
  personalLabel: string | null;
  personalNote: string | null;
  createdAt: string;
  location: {
    id: string;
    name: string;
    address: string;
    latitude: string;
    longitude: string;
    type: string;
    totalReportsCount: number;
    reliabilityScore: string;
    lastReportAt: string | null;
  };
}

export function useSavedPlaces() {
  return useQuery({
    queryKey: ["saved-places"],
    queryFn: ({ signal }) =>
      api<SavedPlaceRow[]>("/api/saved-places", { signal }),
    staleTime: 30_000,
  });
}

export function useSaveLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      locationId: string;
      personalLabel?: string | null;
      personalNote?: string | null;
    }) =>
      api<SavedPlaceRow>("/api/saved-places", {
        method: "POST",
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-places"] }),
  });
}

export function useUnsaveLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (savedPlaceId: string) =>
      api<void>(`/api/saved-places/${savedPlaceId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-places"] }),
  });
}

// Phase 4: label/note editing in MyPlacesSheet
// fallow-ignore-next-line unused-export
export function useUpdateSavedPlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      personalLabel?: string | null;
      personalNote?: string | null;
    }) =>
      api<SavedPlaceRow>(`/api/saved-places/${input.id}`, {
        method: "PATCH",
        body: { personalLabel: input.personalLabel, personalNote: input.personalNote },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-places"] }),
  });
}
