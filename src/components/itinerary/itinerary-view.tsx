"use client";

import { RecordActions } from "@/components/actions/record-actions";
import { RecordStatus, itineraryStatusOptions } from "@/components/actions/record-status";
import { RouteCityManager } from "@/components/itinerary/route-city-manager";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils/format";
import type { CityCover, ItineraryItem, LuggagePlanSummary, PendingItem, Stop, Transport } from "@/types/trip";
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

function scheduleLabel(item: ItineraryItem) {
  if (item.schedule_type === "exact" && item.is_anchor) return "Horário fixo";
  if (item.schedule_type === "window") return "Janela de horário";
  if (item.schedule_type === "period") return "Período";
  if (item.schedule_type === "from") return "A partir de";
  if (item.schedule_type === "until") return "Até";
  return "Flexível";
}

export function ItineraryView({
  tripId,
  stops,
  days,
  pending,
  transports,
  covers,
  luggagePlans,
}: {
  tripId: string;
  stops: Stop[];
  days: ItineraryItem[];
  pending: PendingItem[];
  transports: Transport[];
  covers: CityCover[];
  luggagePlans: LuggagePlanSummary[];
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

  const orderReview = useMemo(() => {
    const position = new Map(draftStops.map((stop, index) => [stop.id, index]));
    const transportConflicts = transports.filter((transport) => {
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
      <div className="segment-control mb-7" role="tablist" aria-label="Visualização do roteiro">
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
              const outbound = transports.find((item) => item.origin_stop_id === stop.id);
              const luggage = luggageReadiness.get(stop.id);
              const luggageUnavailable = Boolean(luggage?.unavailable);
              const luggageSafe = Boolean(luggage?.arrival && luggage?.departure && !luggageUnavailable);
              const isLast = index === displayStops.length - 1;

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
                          {outbound && (
                            <span className="soft-chip">
                              <ArrowRight size={12} />
                              saída definida
                            </span>
                          )}
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
        <div className="space-y-8">
          {Object.entries(grouped).map(([date, items]) => {
            const firstStop = items.find((item) => item.stop_id)?.stop_id;
            const stop = firstStop ? stopById.get(firstStop) : undefined;

            return (
              <section key={date}>
                <div className="day-heading">
                  <div>
                    <p>{date === "Sem data" ? "Sem data" : formatDate(date)}</p>
                    {stop && <h2>{cityName(stop)}</h2>}
                  </div>
                  <CalendarDays size={18} />
                </div>

                <div className="day-timeline">
                  {items.map((item) => {
                    const fixed = item.schedule_type === "exact" && item.is_anchor === true;
                    const time = itemTime(item);

                    return (
                      <div key={item.id} className="day-timeline-row">
                        <div className="day-timeline-marker" aria-hidden="true">
                          <span className={fixed ? "is-fixed" : ""} />
                          <i />
                        </div>

                        <div className="min-w-0 flex-1 pb-5">
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
