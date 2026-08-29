import { RecordActions } from "@/components/actions/record-actions";
import { RecordStatus, accommodationStatusOptions, itineraryStatusOptions, pendingStatusOptions, transportStatusOptions } from "@/components/actions/record-status";
import { LuggagePlanEditor } from "@/components/logistics/luggage-plan-editor";
import { getStopDetails, getTripCityCovers } from "@/lib/queries/trips";
import { formatDate, formatDateTime, valueText } from "@/lib/utils/format";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Hotel,
  MapPin,
  Plane,
} from "lucide-react";
import { notFound } from "next/navigation";

function scheduleLabel(scheduleType?: string | null, isAnchor?: boolean | null) {
  if (scheduleType === "exact" && isAnchor) return "Horário fixo";
  if (scheduleType === "window") return "Janela";
  if (scheduleType === "period") return "Período";
  if (scheduleType === "from") return "A partir de";
  if (scheduleType === "until") return "Até";
  return "Flexível";
}

function transportLabel(mode?: unknown) {
  if (mode === "flight") return "Voo";
  if (mode === "bus") return "Ônibus";
  if (mode === "car") return "Carro";
  if (mode === "transfer") return "Transfer";
  return valueText(mode) || "Deslocamento";
}

export default async function CityPage({
  params,
}: {
  params: Promise<{ stopId: string }>;
}) {
  const { stopId } = await params;

  let data;
  try {
    data = await getStopDetails(stopId);
  } catch (error) {
    if (error instanceof Error && error.message.includes("0 rows")) notFound();
    throw error;
  }

  const {
    stop,
    accommodation,
    arrivalLuggage,
    departureLuggage,
    activities,
    pending,
    inbound,
    outbound,
  } = data;

  const covers = await getTripCityCovers(stop.trip_id);
  const cover = covers.find((item) => item.stop_id === stop.id);
  const city = stop.city || stop.name || "Cidade";
  const accommodationPlace =
    accommodation?.place && !Array.isArray(accommodation.place) ? accommodation.place : null;

  const heroStyle = cover
    ? {
        backgroundImage: `linear-gradient(180deg, rgba(7,28,35,.08), rgba(7,28,35,.72)), url("${cover.image_url.replace(/"/g, "%22")}")`,
      }
    : undefined;

  return (
    <div className="space-y-7">
      <section className={`city-hero ${cover ? "has-cover" : ""}`} style={heroStyle}>
        <div className="relative z-10 flex min-h-[190px] flex-col justify-end">
          <p className={cover ? "text-white/80" : "text-petrol/65"}>
            {stop.start_date ? formatDate(stop.start_date) : "Data pendente"}
            {stop.end_date ? ` — ${formatDate(stop.end_date)}` : ""}
          </p>
          <h1 className={cover ? "text-white" : ""}>{city}</h1>
        </div>
      </section>

      <section>
        <div className="section-heading">
          <h2>Chegada</h2>
        </div>
        <div className="operational-strip">
          <span className="operational-icon"><Plane size={18} /></span>
          <div className="min-w-0 flex-1">
            {inbound ? (
              <>
                <p className="font-semibold">
                  {valueText(inbound.origin_label) || transportLabel(inbound.mode)}
                  {valueText(inbound.origin_label) ? ` → ${city}` : ""}
                </p>
                <p className="mt-1 text-[12px] text-muted">
                  {inbound.arrival_at
                    ? formatDateTime(inbound.arrival_at)
                    : inbound.arrival_date
                      ? formatDate(inbound.arrival_date)
                      : transportLabel(inbound.mode)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <RecordStatus
                    table="transport_segments"
                    id={String(inbound.id)}
                    value={String(inbound.status || "planned")}
                    options={transportStatusOptions}
                    label="Status da chegada"
                    compact
                  />
                  <RecordActions
                    table="transport_segments"
                    id={String(inbound.id)}
                    title={`${valueText(inbound.origin_label) || "Chegada"} → ${city}`}
                    fields={[
                      { name: "origin_label", label: "Origem" },
                      { name: "destination_label", label: "Destino" },
                      { name: "departure_date", label: "Data de saída", type: "date" },
                      { name: "arrival_date", label: "Data de chegada", type: "date" },
                      { name: "operator", label: "Empresa" },
                      { name: "amount", label: "Valor", type: "number", min: "0", step: "0.01" },
                      { name: "notes", label: "Nota", type: "textarea" },
                    ]}
                    values={{
                      origin_label: inbound.origin_label ?? null,
                      destination_label: inbound.destination_label ?? city,
                      departure_date: inbound.departure_date ?? null,
                      arrival_date: inbound.arrival_date ?? null,
                      operator: inbound.operator ?? null,
                      amount: inbound.amount ?? null,
                      notes: inbound.notes ?? null,
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="font-semibold">Chegada ainda não definida</p>
                <p className="mt-1 text-[12px] text-muted">Nenhum deslocamento de chegada registrado.</p>
              </>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="section-heading">
          <h2>Bagagem</h2>
        </div>
        <div className="luggage-grid">
          <LuggagePlanEditor
            tripId={stop.trip_id}
            stopId={stop.id}
            phase="arrival"
            plan={arrivalLuggage}
          />
          <LuggagePlanEditor
            tripId={stop.trip_id}
            stopId={stop.id}
            phase="departure"
            plan={departureLuggage}
          />
        </div>
      </section>

      <section>
        <div className="section-heading">
          <h2>Hospedagem</h2>
        </div>
        <div className="accommodation-panel">
          <span className="operational-icon operational-icon--light"><Hotel size={18} /></span>
          <div className="min-w-0 flex-1">
            {accommodation ? (
              <>
                <p className="font-semibold">{valueText(accommodation.name) || "Hospedagem definida"}</p>
                {accommodationPlace?.address && (
                  <p className="mt-1 text-[12px] text-muted">{String(accommodationPlace.address)}</p>
                )}
                {accommodation.notes && (
                  <p className="mt-2 text-[12px] leading-5 text-muted">{String(accommodation.notes)}</p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <RecordStatus
                    table="accommodations"
                    id={String(accommodation.id)}
                    value={String(accommodation.status || "researching")}
                    options={accommodationStatusOptions}
                    label="Status da hospedagem"
                    compact
                  />
                  <RecordActions
                    table="accommodations"
                    id={String(accommodation.id)}
                    title={String(accommodation.name || "Hospedagem")}
                    fields={[
                      { name: "name", label: "Hospedagem", required: true },
                      { name: "check_in_date", label: "Check-in", type: "date" },
                      { name: "check_out_date", label: "Check-out", type: "date" },
                      { name: "source_url", label: "Link", type: "url" },
                      { name: "notes", label: "Nota", type: "textarea" },
                    ]}
                    values={{
                      name: accommodation.name ?? "",
                      check_in_date: accommodation.check_in_date ?? null,
                      check_out_date: accommodation.check_out_date ?? null,
                      source_url: accommodation.source_url ?? null,
                      notes: accommodation.notes ?? null,
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="font-semibold">Hospedagem pendente</p>
                <p className="mt-1 text-[12px] text-muted">Nenhuma hospedagem registrada para esta cidade.</p>
              </>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="section-heading">
          <h2>Roteiro na cidade</h2>
        </div>
        {activities.length ? (
          <div className="day-timeline">
            {activities.map((item) => {
              const fixed = item.schedule_type === "exact" && item.is_anchor === true;
              const time = item.start_time ? String(item.start_time).slice(0, 5) : null;

              return (
                <div key={String(item.id)} className="day-timeline-row">
                  <div className="day-timeline-marker" aria-hidden="true">
                    <span className={fixed ? "is-fixed" : ""} />
                    <i />
                  </div>
                  <div className="min-w-0 flex-1 pb-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[15px] font-semibold leading-5">
                          {String(item.title ?? item.name ?? "Atividade")}
                        </p>
                        <p className="mt-1 text-[12px] text-muted">
                          {scheduleLabel(item.schedule_type, item.is_anchor)}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <RecordStatus
                            table="itinerary_items"
                            id={String(item.id)}
                            value={String(item.status || "planned")}
                            options={itineraryStatusOptions}
                            label={`Status de ${String(item.title ?? "atividade")}`}
                            compact
                          />
                          <RecordActions
                            table="itinerary_items"
                            id={String(item.id)}
                            title={String(item.title ?? item.name ?? "Atividade")}
                            fields={[
                              { name: "title", label: "Atividade", required: true },
                              { name: "activity_date", label: "Data", type: "date" },
                              { name: "notes", label: "Nota", type: "textarea" },
                            ]}
                            values={{
                              title: String(item.title ?? item.name ?? ""),
                              activity_date: item.activity_date ?? null,
                              notes: item.notes ?? null,
                            }}
                          />
                        </div>
                      </div>
                      {time && (
                        <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-petrol">
                          <Clock3 size={13} />
                          {time}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-surface">
            <MapPin size={20} />
            <p>Nenhuma atividade adicionada.</p>
          </div>
        )}
      </section>

      {pending.length > 0 && (
        <section>
          <div className="section-heading">
            <h2>Pendências</h2>
          </div>
          <div className="divide-y divide-petrol/8 border-y border-petrol/8">
            {pending.map((item) => (
              <div key={String(item.id)} className="flex items-center gap-3 py-4">
                <CheckCircle2 size={17} className="shrink-0 text-petrol" />
                <p className="min-w-0 flex-1 text-[14px] font-medium">{String(item.title)}</p>
                <div className="flex shrink-0 items-center gap-2">
                  <RecordStatus
                    table="pending_items"
                    id={String(item.id)}
                    value={String(item.status || "pending")}
                    options={pendingStatusOptions}
                    label={`Status de ${String(item.title)}`}
                    compact
                  />
                  <RecordActions
                    table="pending_items"
                    id={String(item.id)}
                    title={String(item.title)}
                    fields={[
                      { name: "title", label: "Pendência", required: true },
                      { name: "description", label: "Descrição", type: "textarea" },
                      { name: "due_at", label: "Prazo", type: "datetime-local" },
                      {
                        name: "priority",
                        label: "Prioridade",
                        type: "select",
                        options: [
                          { value: "low", label: "Baixa" },
                          { value: "medium", label: "Média" },
                          { value: "high", label: "Alta" },
                        ],
                      },
                    ]}
                    values={{
                      title: item.title ?? "",
                      description: item.description ?? null,
                      due_at: item.due_at ?? null,
                      priority: item.priority ?? "medium",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="pb-2">
        <div className="section-heading">
          <h2>Saída</h2>
        </div>
        <div className="operational-strip">
          <span className="operational-icon"><ArrowRight size={18} /></span>
          <div className="min-w-0 flex-1">
            {outbound ? (
              <>
                <p className="font-semibold">
                  {city}
                  {valueText(outbound.destination_label) ? ` → ${valueText(outbound.destination_label)}` : ""}
                </p>
                <p className="mt-1 text-[12px] text-muted">
                  {outbound.departure_at
                    ? formatDateTime(outbound.departure_at)
                    : outbound.departure_date
                      ? formatDate(outbound.departure_date)
                      : transportLabel(outbound.mode)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <RecordStatus
                    table="transport_segments"
                    id={String(outbound.id)}
                    value={String(outbound.status || "planned")}
                    options={transportStatusOptions}
                    label="Status da saída"
                    compact
                  />
                  <RecordActions
                    table="transport_segments"
                    id={String(outbound.id)}
                    title={`${city} → ${valueText(outbound.destination_label) || "próximo destino"}`}
                    fields={[
                      { name: "origin_label", label: "Origem" },
                      { name: "destination_label", label: "Destino" },
                      { name: "departure_date", label: "Data de saída", type: "date" },
                      { name: "arrival_date", label: "Data de chegada", type: "date" },
                      { name: "operator", label: "Empresa" },
                      { name: "amount", label: "Valor", type: "number", min: "0", step: "0.01" },
                      { name: "notes", label: "Nota", type: "textarea" },
                    ]}
                    values={{
                      origin_label: outbound.origin_label ?? city,
                      destination_label: outbound.destination_label ?? null,
                      departure_date: outbound.departure_date ?? null,
                      arrival_date: outbound.arrival_date ?? null,
                      operator: outbound.operator ?? null,
                      amount: outbound.amount ?? null,
                      notes: outbound.notes ?? null,
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="font-semibold">Saída ainda não definida</p>
                <p className="mt-1 text-[12px] text-muted">Nenhum próximo deslocamento registrado.</p>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
