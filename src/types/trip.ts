export type Trip = {
  id: string;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  cover_url?: string | null;
};

export type Stop = {
  id: string;
  trip_id: string;
  city?: string | null;
  name?: string | null;
  state_code?: string | null;
  sequence?: number | null;
  sort_order?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  notes?: string | null;
};

export type CityCover = {
  id: string;
  trip_id: string;
  stop_id: string;
  city_name: string;
  sequence: number | null;
  start_date: string | null;
  end_date: string | null;
  bucket_id: string;
  storage_path: string;
  image_url: string;
  source_url?: string | null;
  source_name?: string | null;
  author?: string | null;
  license?: string | null;
  sort_order: number;
  is_active: boolean;
};

export type PendingStatus = "pending" | "checking" | "resolved" | "cancelled";

export type PendingItem = {
  id: string;
  trip_id: string;
  stop_id?: string | null;
  title: string;
  description?: string | null;
  status: PendingStatus;
  priority?: "low" | "medium" | "high" | null;
  due_at?: string | null;
};

export type Transport = {
  id: string;
  trip_id: string;
  origin_stop_id?: string | null;
  destination_stop_id?: string | null;
  origin_place_id?: string | null;
  destination_place_id?: string | null;
  origin_label?: string | null;
  destination_label?: string | null;
  departure_at?: string | null;
  arrival_at?: string | null;
  departure_date?: string | null;
  arrival_date?: string | null;
  mode?: string | null;
  status?: string | null;
  operator?: string | null;
  service_class?: string | null;
  booking_reference?: string | null;
  amount?: number | null;
  source_url?: string | null;
  origin_terminal_name?: string | null;
  origin_terminal_address?: string | null;
  destination_terminal_name?: string | null;
  destination_terminal_address?: string | null;
  has_checked_baggage?: boolean | null;
  baggage_notes?: string | null;
  notes?: string | null;
};

export type FinanceSummary = {
  trip_id: string;
  total_budget: number | null;
  protected_reserve: number | null;
  discovery_budget: number | null;
  fund_balance: number | null;
  future_commitments: number | null;
  available_to_use: number | null;
  net_spent: number | null;
  allocated_card_limit: number | null;
  active_card_holds: number | null;
};

export type Expense = {
  id: string;
  trip_id: string;
  stop_id?: string | null;
  title: string;
  amount: number;
  currency: string;
  payment_method?: string | null;
  occurred_at: string;
  status: string;
  notes?: string | null;
};

export type ScheduleType = "none" | "period" | "window" | "from" | "until" | "exact";

export type ItineraryItem = Record<string, unknown> & {
  id: string;
  trip_id?: string;
  stop_id?: string | null;
  activity_date?: string | null;
  title?: string | null;
  name?: string | null;
  start_time?: string | null;
  schedule_type?: ScheduleType | null;
  is_anchor?: boolean | null;
};


export type TripPreferences = {
  trip_id: string;
  pace: "relaxed" | "balanced" | "full";
  anchor_buffer_minutes: number;
  terminal_buffer_minutes: number;
  airport_buffer_minutes: number;
  wake_prep_minutes: number;
  suggest_wake_time: boolean;
  route_reorder_mode: "never" | "suggest" | "flexible_only";
  live_location_enabled: boolean;
  api_refresh_mode: "manual" | "manual_when_stale" | "automatic";
  offline_essential_data: boolean;
  extra?: Record<string, unknown>;
  updated_at?: string;
};

export type TripFinanceSettings = {
  trip_id: string;
  total_budget: number | null;
  protected_reserve: number;
  discovery_budget: number;
  currency: string;
  updated_at?: string;
};


export type ChangeLogEntry = {
  id: string;
  trip_id: string;
  user_id?: string | null;
  entity_type: string;
  entity_id?: string | null;
  action: "create" | "update" | "archive" | "restore" | "reorder" | "structural_change";
  summary: string;
  created_at: string;
};


export type LuggagePlanSummary = {
  id: string;
  trip_id: string;
  stop_id: string;
  phase: "arrival" | "departure";
  strategy?: string | null;
  status?: string | null;
  available_from?: string | null;
  available_until?: string | null;
  confirmed_at?: string | null;
};
