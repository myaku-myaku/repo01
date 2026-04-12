import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient from "./client";
import type {
  HostDetail,
  ModelStats,
  RateStatsData,
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

// Users
export function useUsers() {
  return useQuery<User[]>({
    queryKey: ["users"],
    queryFn: () => apiClient.get("/auth/users").then((r) => r.data),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      username: string;
      email?: string;
      display_name?: string;
      password: string;
      role?: "admin" | "user";
    }) => apiClient.post("/auth/users", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      data,
    }: {
      userId: number;
      data: {
        email?: string;
        display_name?: string;
        password?: string;
        role?: "admin" | "user";
        is_active?: boolean;
      };
    }) => apiClient.patch(`/auth/users/${userId}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) =>
      apiClient.delete(`/auth/users/${userId}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

// Reservations
export interface ReservationListItem {
  id: number;
  port_id: number;
  reserved_by: number;
  reserved_by_name: string | null;
  reserved_at: string;
  expires_at: string | null;
  purpose: string | null;
  status: "active" | "released" | "expired";
  hostname: string;
  host_id: number;
  office_name: string;
  office_id: number;
  prefecture_name: string;
  prefecture_id: number;
  region_id: number;
  slot_number: string;
  port_number: string;
  port_type: string | null;
  port_rate: string | null;
}

export function useReservations(params?: {
  status?: string;
  region_id?: number;
  prefecture_id?: number;
  office_id?: number;
  host_id?: number;
  my_only?: boolean;
}) {
  return useQuery<ReservationListItem[]>({
    queryKey: ["reservations", params],
    queryFn: () =>
      apiClient
        .get("/ports/reservations", { params })
        .then((r) => r.data),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hostDetail"] });
      qc.invalidateQueries({ queryKey: ["reservations"] });
    },
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

export function useModelStats(rate?: string | null) {
  return useQuery<ModelStats[]>({
    queryKey: ["stats", "byModel", rate ?? "all"],
    queryFn: () =>
      apiClient
        .get("/statistics/by-model", { params: rate ? { rate } : undefined })
        .then((r) => r.data),
  });
}

export function useRegionStats(rate?: string | null) {
  return useQuery<RegionStatsData[]>({
    queryKey: ["stats", "byRegion", rate ?? "all"],
    queryFn: () =>
      apiClient
        .get("/statistics/by-region", { params: rate ? { rate } : undefined })
        .then((r) => r.data),
  });
}

export function useRateStats() {
  return useQuery<RateStatsData[]>({
    queryKey: ["stats", "byRate"],
    queryFn: () => apiClient.get("/statistics/by-rate").then((r) => r.data),
  });
}

export interface BoardStatsData {
  board_name: string | null;
  slot_count: number;
  total_ports: number;
  available_ports: number;
  in_use_ports: number;
  utilization_pct: number;
}

export function useBoardStats() {
  return useQuery<BoardStatsData[]>({
    queryKey: ["stats", "byBoard"],
    queryFn: () => apiClient.get("/statistics/by-board").then((r) => r.data),
  });
}

// Office device list
export interface OfficeDeviceRow {
  office_id: number;
  office_name: string;
  office_code: string;
  prefecture: string;
  region: string;
  total_hosts: number;
  models: Record<string, number>;
}

export interface OfficeDeviceListResponse {
  models: string[];
  offices: OfficeDeviceRow[];
}

export function useOfficeDeviceList() {
  return useQuery<OfficeDeviceListResponse>({
    queryKey: ["officeDeviceList"],
    queryFn: () => apiClient.get("/offices/device-list").then((r) => r.data),
  });
}

// NCE NBI
export interface NCEStatus {
  status: string;
  message: string;
  total_ne?: number;
}

export function useNCEStatus() {
  return useQuery<NCEStatus>({
    queryKey: ["nce", "status"],
    queryFn: () => apiClient.get("/nce/status").then((r) => r.data),
    retry: false,
    staleTime: 60_000,
  });
}

export function useTriggerNCESync() {
  return useMutation({
    mutationFn: () => apiClient.post("/nce/sync").then((r) => r.data),
  });
}

// Import logs
export interface ImportVendorLog {
  vendor: string;
  filename: string;
  file_exported_at: string | null;
  imported_at: string | null;
}

export function useLatestImports() {
  return useQuery<ImportVendorLog[]>({
    queryKey: ["latestImports"],
    queryFn: () => apiClient.get("/import/latest-by-vendor").then((r) => r.data),
  });
}
