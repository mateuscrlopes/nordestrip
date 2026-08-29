export type Trip = { id: string; name: string; start_date?: string | null; end_date?: string | null };
export type Stop = { id: string; trip_id: string; city?: string | null; name?: string | null; sequence?: number | null; start_date?: string | null; end_date?: string | null };
export type PendingItem = { id: string; trip_id: string; stop_id?: string | null; title: string; status?: string | null; due_date?: string | null };
export type Transport = { id: string; trip_id: string; stop_id?: string | null; departure_at?: string | null; arrival_at?: string | null; origin?: string | null; destination?: string | null; mode?: string | null };
export type FinanceSummary = Record<string, unknown> & { available_to_use?: number | null; trip_fund?: number | null; future_commitments?: number | null; protected_reserve?: number | null; net_spend?: number | null; allocated_card_limit?: number | null; temporary_holds?: number | null };
export type ItineraryItem = Record<string, unknown> & { id: string; trip_id?: string; stop_id?: string | null; activity_date?: string | null; title?: string | null; name?: string | null; start_time?: string | null; schedule_type?: string | null };
