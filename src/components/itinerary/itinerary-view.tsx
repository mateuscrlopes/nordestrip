"use client";

import { RecordActions } from "@/components/actions/record-actions";
import { RecordStatus, itineraryStatusOptions } from "@/components/actions/record-status";
import { formatDate } from "@/lib/utils/format";
import type { CityCover, ItineraryItem, PendingItem, Stop, Transport } from "@/types/trip";
import { ArrowRight, CalendarDays, ChevronRight, Clock3, MapPin } from "lucide-react";
import Link from "next/link";
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
  stops,
  days,
  pending,
  transports,
  covers,
}: {
  stops: Stop[];
  days: ItineraryItem[];
  pending: PendingItem[];
  transports: Transport[];
  covers: CityCover[];
}) {
  const [view, setView] = useState<"cities" | "days">("cities");

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
        <div className="route-list">
          {stops.map((stop, index) => {
            const cover = coverByStop.get(stop.id);
            const openPending = pending.filter((item) => item.stop_id === stop.id).length;
            const outbound = transports.find((item) => item.origin_stop_id === stop.id);
            const isLast = index === stops.length - 1;

            return (
              <div key={stop.id} className="route-stop">
                <div className="route-stop-rail" aria-hidden="true">
                  <span>{stop.sequence ?? index + 1}</span>
                  {!isLast && <i />}
                </div>

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

                  <div className="min-w-0 flex-1 py-1">
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

                    {(openPending > 0 || outbound) && (
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
                      </div>
                    )}
                  </div>
                </Link>
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
    </>
  );
}
