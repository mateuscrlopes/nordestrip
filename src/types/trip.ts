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
  sequence?: number | null;
  start_date?: string | null;
  end_date?: string | null;
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
  status: PendingStatus;
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
