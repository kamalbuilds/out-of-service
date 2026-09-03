// Types for the per-equipment reliability index (data/index.json) and its
// derived station-level views. No React or Next.js imports here: this module
// is plain data plus pure functions, importable from server or client code.

export type EquipmentType = "EL" | "ES" | string;

export interface AdaNeighbor {
  stopId: string;
  line: string;
}

export interface CurrentOutage {
  reason: string;
  outagedate: string;
  estimatedreturntoservice: string;
  is_upcoming: boolean;
  is_maintenance: boolean;
}

export interface MetricSource {
  dataset: string;
  query: string;
  rows: number;
}

export interface WorstMonth {
  month: string;
  availability_24h: number;
}

export interface EquipmentMetrics {
  months_observed: number;
  last_month_observed: string | null;
  outages_24m: number;
  unscheduled_24m: number;
  unscheduled_share_24m: number | null;
  entrapments_24m: number;
  availability_24h_mean_24m: number | null;
  availability_am_peak_mean_24m: number | null;
  availability_pm_peak_mean_24m: number | null;
  worst_month: WorstMonth | null;
  availability_24h_mean_recent3: number | null;
  outages_recent3: number;
  unscheduled_recent3: number;
  entrapments_recent3: number;
  source: MetricSource;
}

export interface EquipmentRank {
  availability_24h_mean_24m_rank: number | null;
  availability_24h_mean_24m_percentile: number | null;
  group: "EL" | "ES";
  group_size: number;
}

export type Tier = "reliable" | "watch" | "unreliable" | "unknown";

export interface EquipmentIndexEntry {
  equipment_code: string;
  equipment_type: EquipmentType;
  station: string;
  station_complex_mrn: string | null;
  gtfs_stop_id: string | null;
  lines: string;
  serving: string;
  ada: boolean;
  redundant: boolean;
  nextadanorth: AdaNeighbor | null;
  nextadasouth: AdaNeighbor | null;
  is_active: boolean;
  non_nyct: boolean;
  currently_out: boolean;
  current_outage: CurrentOutage | null;
  metrics: EquipmentMetrics;
  rank: EquipmentRank;
  tier: Tier;
  tier_reason: string;
}

export interface StationSummary {
  station: string;
  station_complex_mrn: string | null;
  gtfs_stop_ids: string[];
  lines: string[];
  equipment_codes: string[];
}

export interface StationScore {
  station_complex_mrn: string | null;
  station: string | null;
  equipment_count: number;
  min_elevator_availability_24m: number | null;
  min_elevator_code: string | null;
  unreliable_count: number;
  redundant_count: number;
  redundant_coverage: number | null;
}
