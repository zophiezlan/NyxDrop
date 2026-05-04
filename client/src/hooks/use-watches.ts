import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface WatchRow {
  id: string;
  locationId: string;
  alertOnStatusChange: boolean;
  alertOnGuardianNote: boolean;
  lastAlertAt: string | null;
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

export function useWatches() {
  return useQuery({
    queryKey: ["watches"],
    queryFn: ({ signal }) => api<WatchRow[]>("/api/watches", { signal }),
    staleTime: 30_000,
  });
}

export function useWatchLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      locationId: string;
      alertOnStatusChange?: boolean;
      alertOnGuardianNote?: boolean;
    }) =>
      api<WatchRow>("/api/watches", {
        method: "POST",
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watches"] }),
  });
}

export function useUnwatchLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (watchId: string) =>
      api<void>(`/api/watches/${watchId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watches"] }),
  });
}

export function useUpdateWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      alertOnStatusChange?: boolean;
      alertOnGuardianNote?: boolean;
    }) =>
      api<WatchRow>(`/api/watches/${input.id}`, {
        method: "PATCH",
        body: {
          alertOnStatusChange: input.alertOnStatusChange,
          alertOnGuardianNote: input.alertOnGuardianNote,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watches"] }),
  });
}
