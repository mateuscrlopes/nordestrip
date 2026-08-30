"use client";

import { RecordActions } from "@/components/actions/record-actions";
import { RecordStatus, itineraryStatusOptions } from "@/components/actions/record-status";
import { RouteCityManager } from "@/components/itinerary/route-city-manager";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils/format";
import type { CityCover, ItineraryItem, LuggagePlanSummary, PendingItem, Stop, Transport, TripPreferences } from "@/types/trip";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  ChevronRight,
  Clock3,
  ListRestart,
  MapPin,
  Save,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

function cityName(stop: Stop) {
  return stop.city || stop.name || "Cidade";
}

function itemTime(item: ItineraryItem) {
  return item.start_time ? item.start_time.slice(0, 5) : null;
}

function periodLabel(value: unknown) {
  if (value === "morning") return "Manhã";
  if (value === "afternoon") return "Tarde";
  if (value === "evening") return "Noite";
  return null;
}

function periodRank(value: unknown) {
  if (value === "morning") return 1;
  if (value === "afternoon") return 2;
  if (value === "evening") return 3;
  return 4;
}

function scheduleLabel(item: ItineraryItem) {
  if (item.schedule_type === "exact" && item.is_anchor) return "Horário fixo";
  if (item.schedule_type === "window") return "Janela de horário";
  if (item.schedule_type === "period") return periodLabel(item.period) || "Período";
  if (item.schedule_type === "from") return "A partir de";
  if (item.schedule_type === "until") return "Até";
  return "Flexível";
}

type ItineraryPlace = {
  id: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  opening_hours?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

function hasPlaceCoordinates(place?: ItineraryPlace) {
  if (!place) return false;
  const latitude = place.latitude == null || place.latitude === "" ? null : Number(place.latitude);
  const longitude = place.longitude == null || place.longitude === "" ? null : Number(place.longitude);
  return latitude != null && longitude != null && Number.isFinite(latitude) && Number.isFinite(longitude);
}

function circuitForPlace(place?: ItineraryPlace) {
  const metadata = place?.metadata;
  const label = metadata && typeof metadata.circuit_label === "string"
    ? metadata.circuit_label
    : "Outros locais";
  const order = metadata && typeof metadata.circuit_order === "number"
    ? metadata.circuit_order
    : 999;
  return { label, order };
}

const itineraryWeekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function ideaPriority(priority: unknown) {
  if (priority === "high") return { key: "high", label: "Principal" };
  if (priority === "low") return { key: "low", label: "Alternativa" };
  return { key: "medium", label: "Complemento" };
}

type ItineraryPlanningWindows = {
  morning_start: string;
  morning_end: string;
  afternoon_start: string;
  afternoon_end: string;
  evening_start: string;
  evening_end: string;
  meal_break_minutes: number;
};

const defaultItineraryPlanningWindows: ItineraryPlanningWindows = {
  morning_start: "08:00",
  morning_end: "12:00",
  afternoon_start: "12:00",
  afternoon_end: "18:00",
  evening_start: "18:00",
  evening_end: "22:00",
  meal_break_minutes: 60,
};

function itineraryPlanningWindows(preferences: TripPreferences | null): ItineraryPlanningWindows {
  const raw = preferences?.extra?.planning_windows;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultItineraryPlanningWindows;
  const value = raw as Record<string, unknown>;

  return {
    morning_start: typeof value.morning_start === "string" ? value.morning_start : defaultItineraryPlanningWindows.morning_start,
    morning_end: typeof value.morning_end === "string" ? value.morning_end : defaultItineraryPlanningWindows.morning_end,
    afternoon_start: typeof value.afternoon_start === "string" ? value.afternoon_start : defaultItineraryPlanningWindows.afternoon_start,
    afternoon_end: typeof value.afternoon_end === "string" ? value.afternoon_end : defaultItineraryPlanningWindows.afternoon_end,
    evening_start: typeof value.evening_start === "string" ? value.evening_start : defaultItineraryPlanningWindows.evening_start,
    evening_end: typeof value.evening_end === "string" ? value.evening_end : defaultItineraryPlanningWindows.evening_end,
    meal_break_minutes: typeof value.meal_break_minutes === "number"
      ? value.meal_break_minutes
      : defaultItineraryPlanningWindows.meal_break_minutes,
  };
}

function clockMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function periodCapacity(period: unknown, windows: ItineraryPlanningWindows) {
  if (period === "morning") {
    return Math.max(0, clockMinutes(windows.morning_end) - clockMinutes(windows.morning_start));
  }
  if (period === "afternoon") {
    return Math.max(
      0,
      clockMinutes(windows.afternoon_end) - clockMinutes(windows.afternoon_start) - windows.meal_break_minutes
    );
  }
  if (period === "evening") {
    return Math.max(
      0,
      clockMinutes(windows.evening_end) - clockMinutes(windows.evening_start) - windows.meal_break_minutes
    );
  }
  return 0;
}

function compactDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}min`;
  if (!rest) return `${hours}h`;
  return `${hours}h${String(rest).padStart(2, "0")}`;
}

type CachedRouteEstimate = {
  stop_id: string;
  circuit_label: string;
  period: string;
  place_ids: string[];
  distance_meters: number;
  duration_minutes: number;
  source: string;
  travel_mode: string;
  calculated_at: string;
};

function cachedRouteEstimate(
  preferences: TripPreferences | null,
  stopId: string | null,
  circuitLabel: string,
  period: string,
  placeIds: string[]
) {
  if (!stopId || placeIds.length < 2) return null;

  const rawEstimates = preferences?.extra?.route_estimates;
  if (!rawEstimates || typeof rawEstimates !== "object" || Array.isArray(rawEstimates)) return null;

  const key = `${stopId}::${circuitLabel}::${period}`;
  const raw = (rawEstimates as Record<string, unknown>)[key];

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const estimate = raw as Partial<CachedRouteEstimate>;
  if (
    !Array.isArray(estimate.place_ids) ||
    typeof estimate.duration_minutes !== "number" ||
    typeof estimate.distance_meters !== "number"
  ) {
    return null;
  }

  const samePlaces =
    estimate.place_ids.length === placeIds.length &&
    estimate.place_ids.every((id, index) => id === placeIds[index]);

  if (!samePlaces) return null;

  return estimate as CachedRouteEstimate;
}

function principalPeriodCapacity(
  items: ItineraryItem[],
  date: string,
  placeById: Map<string, ItineraryPlace>,
  windows: ItineraryPlanningWindows,
  preferences: TripPreferences | null,
  circuitLabel: string
) {
  return ["morning", "afternoon", "evening"]
    .map((period) => {
      const principal = items.filter((item) => {
        if (item.period !== period || item.priority !== "high") return false;
        const placeId = typeof item.place_id === "string" ? item.place_id : null;
        const availability = placeAvailability(placeId ? placeById.get(placeId) : undefined, date);
        return availability.status !== "closed";
      });
      if (!principal.length) return null;

      let visitMin = 0;
      let visitMax = 0;
      let missing = 0;

      for (const item of principal) {
        const minValue = typeof item.duration_min === "number" ? item.duration_min : null;
        const maxValue = typeof item.duration_max === "number" ? item.duration_max : minValue;
        if (minValue == null || maxValue == null) {
          missing += 1;
          continue;
        }
        visitMin += minValue;
        visitMax += maxValue;
      }

      const placeIds = principal
        .map((item) => typeof item.place_id === "string" ? item.place_id : null)
        .filter((value): value is string => Boolean(value));
      const stopId = typeof principal[0]?.stop_id === "string" ? principal[0].stop_id : null;
      const routeEstimate = cachedRouteEstimate(
        preferences,
        stopId,
        circuitLabel,
        period,
        placeIds
      );
      const travelMinutes = routeEstimate?.duration_minutes ?? 0;
      const min = visitMin + travelMinutes;
      const max = visitMax + travelMinutes;

      const capacity = periodCapacity(period, windows);
      let state: "fit" | "tight" | "overflow" | "incomplete" = "fit";
      if (missing > 0) state = "incomplete";
      else if (min > capacity) state = "overflow";
      else if (max > capacity) state = "tight";

      return {
        period,
        min,
        max,
        visitMin,
        visitMax,
        missing,
        capacity,
        state,
        travelMinutes,
        distanceMeters: routeEstimate?.distance_meters ?? null,
        routeCached: Boolean(routeEstimate),
        needsRoute: principal.length >= 2 && !routeEstimate,
        stopId,
      };
    })
    .filter(Boolean) as Array<{
      period: string;
      min: number;
      max: number;
      visitMin: number;
      visitMax: number;
      missing: number;
      capacity: number;
      state: "fit" | "tight" | "overflow" | "incomplete";
      travelMinutes: number;
      distanceMeters: number | null;
      routeCached: boolean;
      needsRoute: boolean;
      stopId: string | null;
    }>;
}

function placeAvailability(place: ItineraryPlace | undefined, date: string) {
  if (!place || date === "Sem data") {
    return { status: "confirm" as const, label: "Confirmar funcionamento" };
  }

  const metadata = place.metadata ?? {};
  const confidence = typeof metadata.confidence === "string" ? metadata.confidence : "reconfirm";
  const hours = place.opening_hours;

  if (hours?.always_open === true) {
    return confidence === "verified"
      ? { status: "open" as const, label: "Acesso livre" }
      : { status: "confirm" as const, label: "Acesso livre · reconfirmar" };
  }

  const weekly = hours?.weekly;
  if (weekly && typeof weekly === "object" && !Array.isArray(weekly)) {
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    const slots = (weekly as Record<string, unknown>)[itineraryWeekdayKeys[day]];

    if (Array.isArray(slots)) {
      if (!slots.length) return { status: "closed" as const, label: "Fechado neste dia" };

      const labels = slots
        .filter((slot) => Array.isArray(slot) && slot.length >= 2)
        .map((slot) => `${String(slot[0])}–${String(slot[1])}`);
      const hoursLabel = labels.length ? labels.join(" / ") : "Horário publicado";

      return confidence === "verified"
        ? { status: "open" as const, label: hoursLabel }
        : { status: "confirm" as const, label: `${hoursLabel} · reconfirmar` };
    }
  }

  return { status: "confirm" as const, label: "Horário a confirmar" };
}

export function ItineraryView({
  tripId,
  stops,
  days,
  pending,
  transports,
  covers,
  luggagePlans,
  places,
  preferences,
}: {
  tripId: string;
  stops: Stop[];
  days: ItineraryItem[];
  pending: PendingItem[];
  transports: Transport[];
  covers: CityCover[];
  luggagePlans: LuggagePlanSummary[];
  places: Record<string, unknown>[];
  preferences: TripPreferences | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<"cities" | "days">("cities");
  const [reordering, setReordering] = useState(false);
  const [draftStops, setDraftStops] = useState<Stop[]>(stops);
  const [reviewingOrder, setReviewingOrder] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderError, setOrderError] = useState("");

  const coverByStop = useMemo(
    () => new Map(covers.map((cover) => [cover.stop_id, cover])),
    [covers]
  );

  const stopById = useMemo(
    () => new Map(stops.map((stop) => [stop.id, stop])),
    [stops]
  );

  const placeById = useMemo(
    () => new Map(
      (places as unknown as ItineraryPlace[]).map((place) => [place.id, place])
    ),
    [places]
  );

  const planningWindows = useMemo(
    () => itineraryPlanningWindows(preferences),
    [preferences]
  );

  const grouped = useMemo(
    () =>
      days.reduce<Record<string, ItineraryItem[]>>((all, item) => {
        const key = item.activity_date || "Sem data";
        (all[key] ||= []).push(item);
        return all;
      }, {}),
    [days]
  );

  const displayStops = reordering ? draftStops : stops;
  const changedStops = draftStops.filter((stop, index) => stops[index]?.id !== stop.id).length;

  const luggageReadiness = useMemo(() => {
    const safeStatuses = new Set(["confirmed", "not_needed"]);
    const byStop = new Map<string, { arrival: boolean; departure: boolean; unavailable: boolean }>();

    for (const stop of stops) {
      byStop.set(stop.id, { arrival: false, departure: false, unavailable: false });
    }

    for (const plan of luggagePlans) {
      const current = byStop.get(plan.stop_id);
      if (!current) continue;
      if (plan.status === "unavailable") current.unavailable = true;
      if (plan.phase === "arrival" && safeStatuses.has(plan.status || "")) current.arrival = true;
      if (plan.phase === "departure" && safeStatuses.has(plan.status || "")) current.departure = true;
    }

    return byStop;
  }, [luggagePlans, stops]);

  const luggageBlockedCities = useMemo(
    () => stops.filter((stop) => {
      const readiness = luggageReadiness.get(stop.id);
      return !readiness || !readiness.arrival || !readiness.departure || readiness.unavailable;
    }).length,
    [luggageReadiness, stops]
  );

  const unresolvedRouteConnections = useMemo(() => {
    let unresolved = 0;

    for (let index = 0; index < stops.length - 1; index += 1) {
      const origin = stops[index];
      const destination = stops[index + 1];
      const connected = transports.some(
        (transport) =>
          transport.status !== "cancelled" &&
          transport.origin_stop_id === origin.id &&
          transport.destination_stop_id === destination.id
      );
      if (!connected) unresolved += 1;
    }

    return unresolved;
  }, [stops, transports]);

  const orderReview = useMemo(() => {
    const position = new Map(draftStops.map((stop, index) => [stop.id, index]));
    const transportConflicts = transports.filter((transport) => {
      if (transport.status === "cancelled") return false;
      if (!transport.origin_stop_id || !transport.destination_stop_id) return false;
      const origin = position.get(transport.origin_stop_id);
      const destination = position.get(transport.destination_stop_id);
      if (origin == null || destination == null) return false;
      return destination !== origin + 1;
    }).length;

    let dateConflicts = 0;
    for (let index = 1; index < draftStops.length; index += 1) {
      const previous = draftStops[index - 1];
      const current = draftStops[index];
      if (previous.start_date && current.start_date && current.start_date < previous.start_date) {
        dateConflicts += 1;
      }
    }

    return { transportConflicts, dateConflicts };
  }, [draftStops, transports]);

  function startReordering() {
    setDraftStops(stops);
    setOrderError("");
    setReordering(true);
  }

  function cancelReordering() {
    setDraftStops(stops);
    setOrderError("");
    setReviewingOrder(false);
    setReordering(false);
  }

  function moveStop(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draftStops.length) return;

    setDraftStops((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function saveOrder() {
    setSavingOrder(true);
    setOrderError("");
    const supabase = createClient();
    const { error } = await supabase.rpc("reorder_trip_stops", {
      p_trip_id: tripId,
      p_stop_ids: draftStops.map((stop) => stop.id),
    });

    if (error) {
      setOrderError(error.message);
      setSavingOrder(false);
      return;
    }

    setSavingOrder(false);
    setReviewingOrder(false);
    setReordering(false);
    router.refresh();
  }

  return (
    <>
      <div className="segment-control mb-5" role="tablist" aria-label="Visualização do roteiro">
        <button
          type="button"
          role="tab"
          aria-selected={view === "cities"}
          onClick={() => setView("cities")}
          className={view === "cities" ? "is-active" : ""}
        >
          Cidades
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "days"}
          onClick={() => setView("days")}
          className={view === "days" ? "is-active" : ""}
        >
          Dias
        </button>
      </div>

      {view === "cities" ? (
        <>
          {luggageBlockedCities > 0 && !reordering && (
            <div className="route-luggage-warning">
              <strong>Bagagem ainda impede fechar a rota em {luggageBlockedCities} {luggageBlockedCities === 1 ? "cidade" : "cidades"}</strong>
              <span>Confirme onde as malas ficam na chegada e na saída antes de considerar o trecho operacionalmente resolvido.</span>
            </div>
          )}

          {unresolvedRouteConnections > 0 && !reordering && (
            <div className="route-luggage-warning">
              <strong>{unresolvedRouteConnections} {unresolvedRouteConnections === 1 ? "conexão entre cidades ainda está" : "conexões entre cidades ainda estão"} sem deslocamento definido</strong>
              <span>Registre o transporte entre cidades vizinhas para fechar a sequência operacional da rota.</span>
            </div>
          )}

          {stops.length > 1 && (
            <div className="route-edit-bar">
              <div>
                <strong>{reordering ? "Ajuste a ordem das cidades" : "Estrutura da rota"}</strong>
                <span>
                  {reordering
                    ? "As datas e reservas não mudam automaticamente."
                    : "Reordene a rota sem perder os registros ligados às cidades."}
                </span>
              </div>
              {reordering ? (
                <div className="route-edit-actions">
                  <button type="button" className="route-edit-secondary" onClick={cancelReordering}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="route-edit-primary"
                    disabled={changedStops === 0}
                    onClick={() => setReviewingOrder(true)}
                  >
                    <Save size={14} />
                    Revisar
                  </button>
                </div>
              ) : (
                <div className="route-edit-actions">
                  <RouteCityManager tripId={tripId} mode="add" />
                  <button type="button" className="route-edit-primary" onClick={startReordering}>
                    <ListRestart size={15} />
                    Reordenar
                  </button>
                </div>
              )}
            </div>
          )}

          {reordering && (
            <div className="route-reorder-list">
              {draftStops.map((stop, index) => (
                <div key={stop.id} className="route-reorder-row">
                  <span className="route-reorder-number">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <strong>{cityName(stop)}</strong>
                    {(stop.start_date || stop.end_date) && (
                      <small>
                        {formatDate(stop.start_date) || "Data pendente"}
                        {stop.end_date ? ` — ${formatDate(stop.end_date)}` : ""}
                      </small>
                    )}
                  </div>
                  <div className="route-reorder-buttons">
                    <button
                      type="button"
                      aria-label={`Mover ${cityName(stop)} para cima`}
                      disabled={index === 0}
                      onClick={() => moveStop(index, -1)}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Mover ${cityName(stop)} para baixo`}
                      disabled={index === draftStops.length - 1}
                      onClick={() => moveStop(index, 1)}
                    >
                      <ArrowDown size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {orderError && <p className="add-error mt-3" role="alert">{orderError}</p>}
            </div>
          )}

          <div className="route-list">
            {displayStops.map((stop, index) => {
              const cover = coverByStop.get(stop.id);
              const openPending = pending.filter((item) => item.stop_id === stop.id).length;
              const inbound = transports.find((item) => item.destination_stop_id === stop.id && item.status !== "cancelled");
              const outbound = transports.find((item) => item.origin_stop_id === stop.id && item.status !== "cancelled");
              const luggage = luggageReadiness.get(stop.id);
              const luggageUnavailable = Boolean(luggage?.unavailable);
              const luggageSafe = Boolean(luggage?.arrival && luggage?.departure && !luggageUnavailable);
              const isLast = index === displayStops.length - 1;
              const inboundConfirmed = Boolean(
                inbound && ["reserved", "purchased", "confirmed", "completed"].includes(inbound.status || "")
              );
              const inboundLabel = inbound
                ? inboundConfirmed
                  ? "chegada confirmada"
                  : "chegada em planejamento"
                : "chegada pendente";
              const outboundConfirmed = Boolean(
                outbound && ["reserved", "purchased", "confirmed", "completed"].includes(outbound.status || "")
              );
              const outboundLabel = outbound
                ? outboundConfirmed
                  ? "saída confirmada"
                  : "saída em planejamento"
                : isLast
                  ? "retorno pendente"
                  : "saída pendente";

              return (
                <div key={stop.id} className="route-stop">
                  <div className="route-stop-rail" aria-hidden="true">
                    <span>{index + 1}</span>
                    {!isLast && <i />}
                  </div>

                  <div className="route-stop-card-wrap">
                    <Link href={`/cidade/${stop.id}`} className="route-stop-card group">
                      {cover ? (
                        <div
                          className="route-stop-image"
                          style={{ backgroundImage: `url("${cover.image_url.replace(/"/g, "%22")}")` }}
                        />
                      ) : (
                        <div className="route-stop-image route-stop-image--empty">
                          <MapPin size={20} />
                        </div>
                      )}

                      <div className="min-w-0 flex-1 py-1 pr-8">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h2>{cityName(stop)}</h2>
                            {(stop.start_date || stop.end_date) && (
                              <p className="mt-1 text-[12px] text-muted">
                                {formatDate(stop.start_date) || "Data pendente"}
                                {stop.end_date ? ` — ${formatDate(stop.end_date)}` : ""}
                              </p>
                            )}
                          </div>
                          <ChevronRight size={18} className="mt-1 shrink-0 text-muted transition group-hover:translate-x-0.5" />
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {openPending > 0 && (
                            <span className="soft-chip soft-chip--sand">
                              {openPending} {openPending === 1 ? "pendência" : "pendências"}
                            </span>
                          )}
                          <span className={inboundConfirmed ? "soft-chip" : "soft-chip soft-chip--sand"}>
                            <ArrowDown size={12} />
                            {inboundLabel}
                          </span>
                          <span className={outboundConfirmed ? "soft-chip" : "soft-chip soft-chip--sand"}>
                            <ArrowRight size={12} />
                            {outboundLabel}
                          </span>
                          <span className={luggageSafe ? "soft-chip" : "soft-chip soft-chip--sand"}>
                            {luggageUnavailable ? "bagagem indisponível" : luggageSafe ? "bagagem confirmada" : "bagagem pendente"}
                          </span>
                        </div>
                      </div>
                    </Link>
                    {!reordering && (
                      <div className="route-stop-manage">
                        <RouteCityManager tripId={tripId} stop={stop} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {!stops.length && (
              <div className="empty-surface">
                <MapPin size={20} />
                <p>As cidades ainda não foram adicionadas.</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="day-list">
          {Object.entries(grouped).map(([date, items], dayIndex, entries) => {
            const firstStop = items.find((item) => item.stop_id)?.stop_id;
            const stop = firstStop ? stopById.get(firstStop) : undefined;
            const previousItems = dayIndex > 0 ? entries[dayIndex - 1]?.[1] ?? [] : [];
            const previousStopId = previousItems.find((item) => item.stop_id)?.stop_id;
            const startsNewCity = Boolean(stop && stop.id !== previousStopId);
            const plannedItems = items.filter((item) => item.status !== "idea");
            const ideaItems = items.filter((item) => item.status === "idea");
            const ideaCircuits = Array.from(
              ideaItems.reduce<Map<string, { label: string; items: ItineraryItem[] }>>((groups, item) => {
                const placeId = typeof item.place_id === "string" ? item.place_id : null;
                const place = placeId ? placeById.get(placeId) : undefined;
                const circuit = circuitForPlace(place);
                const current = groups.get(circuit.label) ?? { label: circuit.label, items: [] };
                current.items.push(item);
                groups.set(circuit.label, current);
                return groups;
              }, new Map()).values()
            ).map((group) => {
              const sortedItems = [...group.items].sort((a, b) => {
                const periodDifference = periodRank(a.period) - periodRank(b.period);
                if (periodDifference !== 0) return periodDifference;

                const placeAId = typeof a.place_id === "string" ? a.place_id : null;
                const placeBId = typeof b.place_id === "string" ? b.place_id : null;
                const placeA = placeAId ? placeById.get(placeAId) : undefined;
                const placeB = placeBId ? placeById.get(placeBId) : undefined;
                return circuitForPlace(placeA).order - circuitForPlace(placeB).order;
              });
              const availability = sortedItems.map((item) => {
                const placeId = typeof item.place_id === "string" ? item.place_id : null;
                return placeAvailability(placeId ? placeById.get(placeId) : undefined, date);
              });

              const geocodedCount = sortedItems.filter((item) => {
                const placeId = typeof item.place_id === "string" ? item.place_id : null;
                return hasPlaceCoordinates(placeId ? placeById.get(placeId) : undefined);
              }).length;

              return {
                ...group,
                items: sortedItems,
                openCount: availability.filter((item) => item.status === "open").length,
                confirmCount: availability.filter((item) => item.status === "confirm").length,
                closedCount: availability.filter((item) => item.status === "closed").length,
                geocodedCount,
                capacity: principalPeriodCapacity(
                  sortedItems,
                  date,
                  placeById,
                  planningWindows,
                  preferences,
                  group.label
                ),
              };
            });

            return (
              <section
                key={date}
                className={startsNewCity ? "day-section day-section--city-start" : "day-section"}
              >
                {startsNewCity && stop && (
                  <div className="day-city-divider">
                    <span className="day-city-divider-icon"><MapPin size={14} /></span>
                    <div>
                      <small>Cidade</small>
                      <strong>{cityName(stop)}</strong>
                    </div>
                  </div>
                )}

                <div className="day-heading">
                  <div>
                    <p>{stop ? cityName(stop) : "Roteiro"}</p>
                    <h2>{date === "Sem data" ? "Sem data" : formatDate(date)}</h2>
                  </div>
                  <div className="day-heading-meta">
                    <span>{items.length} {items.length === 1 ? "item" : "itens"}</span>
                    <CalendarDays size={17} />
                  </div>
                </div>

                <div className="day-timeline">
                  {plannedItems.map((item) => {
                    const fixed = item.schedule_type === "exact" && item.is_anchor === true;
                    const time = itemTime(item);

                    return (
                      <div key={item.id} className="day-timeline-row">
                        <div className="day-timeline-marker" aria-hidden="true">
                          <span className={fixed ? "is-fixed" : ""} />
                          <i />
                        </div>

                        <div className="min-w-0 flex-1 pb-3">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[15px] font-semibold leading-5">
                                {item.title || item.name || "Atividade"}
                              </p>
                              <p className="mt-1 text-[12px] text-muted">{scheduleLabel(item)}</p>
                              <div className="mt-2">
                                <RecordStatus
                                  table="itinerary_items"
                                  id={item.id}
                                  value={String(item.status || "planned")}
                                  options={itineraryStatusOptions}
                                  label={`Status de ${item.title || item.name || "atividade"}`}
                                  compact
                                />
                              </div>
                            </div>
                            <div className="flex shrink-0 items-start gap-2">
                              {time && (
                                <span className="mt-1 flex items-center gap-1 text-[12px] font-medium text-petrol">
                                  <Clock3 size={13} />
                                  {time}
                                </span>
                              )}
                              <RecordActions
                                table="itinerary_items"
                                id={item.id}
                                title={String(item.title || item.name || "Atividade")}
                                fields={[
                                  { name: "title", label: "Atividade", required: true },
                                  { name: "activity_date", label: "Data", type: "date" },
                                  { name: "notes", label: "Nota", type: "textarea" },
                                ]}
                                values={{
                                  title: String(item.title || item.name || ""),
                                  activity_date: item.activity_date || null,
                                  notes: typeof item.notes === "string" ? item.notes : null,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {ideaItems.length > 0 && (
                  <details className="day-ideas">
                    <summary>
                      <span className="day-ideas-heading">
                        <span className="day-ideas-icon"><MapPin size={15} /></span>
                        <span>
                          <strong>Locais para considerar</strong>
                          <small>Selecionados para este dia, ainda sem ordem ou horário</small>
                        </span>
                      </span>
                      <span className="day-ideas-count">{ideaItems.length}</span>
                      <ChevronRight size={16} className="day-ideas-chevron" />
                    </summary>
                    <div className="day-ideas-list">
                      {ideaCircuits.map((circuit) => (
                        <div key={circuit.label} className="day-circuit">
                          <div className="day-circuit-heading">
                            <div>
                              <strong>{circuit.label}</strong>
                              <small>Ordem sugerida por período do dia e proximidade</small>
                            </div>
                            <div className="day-circuit-summary">
                              {circuit.geocodedCount === circuit.items.length ? (
                                <span className="is-map-ready">Mapa completo</span>
                              ) : circuit.geocodedCount > 0 ? (
                                <span className="is-map-partial">{circuit.geocodedCount}/{circuit.items.length} no mapa</span>
                              ) : (
                                <span className="is-map-missing">Mapa pendente</span>
                              )}
                              {circuit.openCount > 0 && <span className="is-open">{circuit.openCount} viáveis</span>}
                              {circuit.confirmCount > 0 && <span className="is-confirm">{circuit.confirmCount} confirmar</span>}
                              {circuit.closedCount > 0 && <span className="is-closed">{circuit.closedCount} fechados</span>}
                            </div>
                          </div>

                          {circuit.capacity.length > 0 && (
                            <div className="day-circuit-capacity">
                              {circuit.capacity.map((summary) => (
                                <div key={summary.period} className={`day-capacity-row day-capacity-row--${summary.state}`}>
                                  <div>
                                    <strong>{periodLabel(summary.period)}</strong>
                                    <span>
                                      {summary.missing
                                        ? `${summary.missing} principal sem duração completa`
                                        : summary.routeCached
                                          ? `Visitas ${compactDuration(summary.visitMin)}–${compactDuration(summary.visitMax)} + ${compactDuration(summary.travelMinutes)} a pé`
                                          : `Principais ${compactDuration(summary.visitMin)}–${compactDuration(summary.visitMax)}`}
                                    </span>
                                  </div>
                                  <em>
                                    {summary.state === "fit" && "Cabe"}
                                    {summary.state === "tight" && "Apertado"}
                                    {summary.state === "overflow" && "Não cabe"}
                                    {summary.state === "incomplete" && "Incompleto"}
                                  </em>
                                  <small>
                                    Janela útil {compactDuration(summary.capacity)}
                                    {summary.routeCached
                                      ? ` · deslocamento a pé incluído${summary.distanceMeters != null ? ` · ${(summary.distanceMeters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km` : ""}`
                                      : summary.needsRoute && summary.stopId
                                        ? (
                                            <>
                                              {" · "}
                                              <Link
                                                href={`/mapa?stop=${encodeURIComponent(summary.stopId)}&circuit=${encodeURIComponent(circuit.label)}#mapa-da-viagem`}
                                                className="font-medium text-petrol underline decoration-petrol/30 underline-offset-2"
                                              >
                                                calcule este circuito no Mapa para incluir deslocamento
                                              </Link>
                                            </>
                                          )
                                        : summary.needsRoute
                                          ? " · calcule este circuito no Mapa para incluir deslocamento"
                                          : " · sem deslocamento entre Principais"}
                                  </small>
                                </div>
                              ))}
                            </div>
                          )}

                          {circuit.items.map((item, index) => {
                            const placeId = typeof item.place_id === "string" ? item.place_id : null;
                            const availability = placeAvailability(placeId ? placeById.get(placeId) : undefined, date);

                            return (
                              <div key={item.id} className={`day-idea-row day-idea-row--${availability.status}`}>
                                <span className="day-circuit-order">{index + 1}</span>
                                <div className="min-w-0 flex-1">
                                  <div className="day-idea-title-line">
                                    <strong>{item.title || item.name || "Local"}</strong>
                                    {periodLabel(item.period) && (
                                      <span className="day-idea-period">{periodLabel(item.period)}</span>
                                    )}
                                    <span className={`day-idea-priority day-idea-priority--${ideaPriority(item.priority).key}`}>
                                      {ideaPriority(item.priority).label}
                                    </span>
                                  </div>
                                  <small className={`day-place-availability day-place-availability--${availability.status}`}>
                                    {availability.label}
                                  </small>
                                </div>
                                <div className="day-idea-actions">
                                  <RecordStatus
                                    table="itinerary_items"
                                    id={item.id}
                                    value={String(item.status || "idea")}
                                    options={itineraryStatusOptions}
                                    label={`Status de ${item.title || item.name || "local"}`}
                                    compact
                                  />
                                  <RecordActions
                                    table="itinerary_items"
                                    id={item.id}
                                    title={String(item.title || item.name || "Local")}
                                    fields={[
                                      { name: "title", label: "Local", required: true },
                                      { name: "activity_date", label: "Data", type: "date" },
                                      { name: "notes", label: "Nota", type: "textarea" },
                                    ]}
                                    values={{
                                      title: String(item.title || item.name || ""),
                                      activity_date: item.activity_date || null,
                                      notes: typeof item.notes === "string" ? item.notes : null,
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </section>
            );
          })}

          {!days.length && (
            <div className="empty-surface">
              <CalendarDays size={20} />
              <p>O roteiro por dias ainda não possui atividades.</p>
            </div>
          )}
        </div>
      )}

      {reviewingOrder && (
        <div className="edit-overlay" onClick={() => setReviewingOrder(false)}>
          <section className="edit-sheet route-impact-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="edit-sheet-header">
              <div>
                <p>Revisão de impacto</p>
                <h2>Aplicar nova ordem das cidades?</h2>
              </div>
              <button type="button" className="add-icon-button" aria-label="Fechar" onClick={() => setReviewingOrder(false)}>
                <X size={19} />
              </button>
            </div>

            <div className="route-impact-body">
              <div className="route-impact-summary">
                <strong>{changedStops} {changedStops === 1 ? "cidade muda" : "cidades mudam"} de posição</strong>
                <span>A ordem será atualizada. Datas, atividades, reservas e deslocamentos não serão movidos automaticamente.</span>
              </div>

              {(orderReview.dateConflicts > 0 || orderReview.transportConflicts > 0) && (
                <div className="route-impact-warning">
                  <strong>Há pontos para revisar depois da alteração</strong>
                  {orderReview.dateConflicts > 0 && (
                    <span>{orderReview.dateConflicts} sequência de datas deixa de acompanhar a nova ordem.</span>
                  )}
                  {orderReview.transportConflicts > 0 && (
                    <span>{orderReview.transportConflicts} deslocamento não liga cidades vizinhas na nova rota.</span>
                  )}
                </div>
              )}

              <div className="route-impact-sequence">
                {draftStops.map((stop, index) => (
                  <div key={stop.id}>
                    <span>{index + 1}</span>
                    <strong>{cityName(stop)}</strong>
                  </div>
                ))}
              </div>

              {orderError && <p className="add-error" role="alert">{orderError}</p>}

              <div className="route-impact-actions">
                <button type="button" className="add-secondary" onClick={() => setReviewingOrder(false)}>
                  Voltar
                </button>
                <button type="button" className="add-primary" disabled={savingOrder} onClick={saveOrder}>
                  {savingOrder ? "Salvando..." : "Aplicar nova ordem"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
