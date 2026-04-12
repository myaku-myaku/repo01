export interface User {
  id: number;
  username: string;
  email: string | null;
  display_name: string | null;
  role: "admin" | "user";
  is_active: boolean;
}

export interface TreeRegion {
  id: number;
  name: string;
  code: string;
  prefectures: TreePrefecture[];
}

export interface TreePrefecture {
  id: number;
  name: string;
  code: string;
}

export interface TreeOffice {
  id: number;
  name: string;
  code: string;
  address: string | null;
  host_count: number;
}

export interface TreeHost {
  id: number;
  hostname: string;
  model: string | null;
  vendor: string | null;
  status: string;
}

export interface ActiveReservation {
  id: number;
  reserved_by: number;
  reserved_by_name: string | null;
  reserved_at: string;
  expires_at: string | null;
  purpose: string | null;
}

export interface PortData {
  id: number;
  slot_id: number;
  port_number: string;
  port_name: string | null;
  port_type: string | null;
  port_rate: string | null;
  layer_rate: string | null;
  admin_status: string | null;
  oper_status: string | null;
  usage_status: "available" | "in_use" | "reserved" | "faulty";
  description: string | null;
  sfp_info: Record<string, unknown> | null;
  active_reservation: ActiveReservation | null;
}

export interface SlotData {
  id: number;
  host_id: number;
  slot_number: string;
  board_name: string | null;
  board_type: string | null;
  status: "empty" | "installed" | "faulty";
  ports: PortData[];
}

export interface HostDetail {
  id: number;
  office_id: number;
  hostname: string;
  model: string | null;
  vendor: string | null;
  ip_address: string | null;
  software_version: string | null;
  ne_type: string | null;
  status: string;
  slots: SlotData[];
}

export interface SummaryStats {
  total_hosts: number;
  total_slots: number;
  total_ports: number;
  available_ports: number;
  in_use_ports: number;
  reserved_ports: number;
  faulty_ports: number;
}

export interface ModelStats {
  model: string | null;
  vendor: string | null;
  host_count: number;
  total_ports: number;
  available_ports: number;
  utilization_pct: number;
}

export interface RegionStatsData {
  region_name: string;
  host_count: number;
  total_ports: number;
  available_ports: number;
  utilization_pct: number;
}

export interface RateStatsData {
  rate_category: string;
  total_ports: number;
  available_ports: number;
  in_use_ports: number;
  reserved_ports: number;
  utilization_pct: number;
}
