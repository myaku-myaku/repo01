import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient from "./client";
import type {
  HostDetail,
  ModelStats,
  RegionStatsData,
  SummaryStats,
  TreeHost,
  TreeOffice,
  TreeRegion,
  User,
} from "@/types";

// Auth
export function useMe() {
  return useQuery<User>({
    queryKey: ["me"],
    queryFn: () => apiClient.get("/auth/me").then((r) => r.data),
    retry: false,
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: (data: { username: string; password: string }) =>
      apiClient.post("/auth/login", data).then((r) => r.data),
  });
}

// Tree
export function useRegionTree() {
  return useQuery<TreeRegion[]>({
    queryKey: ["regionTree"],
    queryFn: () => apiClient.get("/regions/tree").then((r) => r.data),
  });
}

export function useOffices(prefectureId: number | null) {
  return useQuery<TreeOffice[]>({
    queryKey: ["offices", prefectureId],
    queryFn: () =>
      apiClient
        .get("/regions/offices", { params: { prefecture_id: prefectureId } })
        .then((r) => r.data),
    enabled: prefectureId !== null,
  });
}

export function useHostsByOffice(officeId: number | null) {
  return useQuery<TreeHost[]>({
    queryKey: ["hosts", officeId],
    queryFn: () =>
      apiClient
        .get("/regions/hosts", { params: { office_id: officeId } })
        .then((r) => r.data),
    enabled: officeId !== null,
  });
}

// Host detail
export function useHostDetail(hostId: number | null) {
  return useQuery<HostDetail>({
    queryKey: ["hostDetail", hostId],
    queryFn: () => apiClient.get(`/hosts/${hostId}`).then((r) => r.data),
    enabled: hostId !== null,
  });
}

// Port operations
export function useUpdatePort() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      portId,
      data,
    }: {
      portId: number;
      data: { description?: string; usage_status?: string };
    }) => apiClient.patch(`/ports/${portId}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hostDetail"] }),
  });
}

export function useReservePort() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      portId,
      data,
    }: {
      portId: number;
      data: { purpose?: string; expires_at?: string };
    }) => apiClient.post(`/ports/${portId}/reserve`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hostDetail"] }),
  });
}

export function useReleaseReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (portId: number) =>
      apiClient.delete(`/ports/${portId}/reserve`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hostDetail"] }),
  });
}

// Import
export function useImportFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiClient.post("/import/upload", form).then((r) => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["regionTree"] });
      qc.invalidateQueries({ queryKey: ["offices"] });
      qc.invalidateQueries({ queryKey: ["hosts"] });
    },
  });
}

// Statistics
export function useSummaryStats() {
  return useQuery<SummaryStats>({
    queryKey: ["stats", "summary"],
    queryFn: () => apiClient.get("/statistics/summary").then((r) => r.data),
  });
}

export function useModelStats() {
  return useQuery<ModelStats[]>({
    queryKey: ["stats", "byModel"],
    queryFn: () => apiClient.get("/statistics/by-model").then((r) => r.data),
  });
}

export function useRegionStats() {
  return useQuery<RegionStatsData[]>({
    queryKey: ["stats", "byRegion"],
    queryFn: () => apiClient.get("/statistics/by-region").then((r) => r.data),
  });
}
