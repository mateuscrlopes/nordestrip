import { RecordActions } from "@/components/actions/record-actions";
import { RecordStatus, accommodationStatusOptions, itineraryStatusOptions, pendingStatusOptions, transportStatusOptions } from "@/components/actions/record-status";
import { LuggagePlanEditor } from "@/components/logistics/luggage-plan-editor";
import { AccommodationEditor } from "@/components/lodging/accommodation-editor";
import { AccommodationSearch } from "@/components/lodging/accommodation-search";
import { BusSearch } from "@/components/transport/bus-search";
import { getStopDetails, getTripCityCovers, getTripPreferences } from "@/lib/queries/trips";
import { formatDate, formatDateTime, formatTime, valueText } from "@/lib/utils/format";
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
  if (mode === "car" || mode === "car_rental") return "Carro alugado";
  if (mode === "transfer") return "Transfer";
  return valueText(mode) || "Deslocamento";
}

function terminalMapsUrl(name?: unknown, address?: unknown) {
  const query = [valueText(name), valueText(address)].filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

export default async function CityPage({
  params,
  searchParams,
}: {
  params: Promise<{ stopId: string }>;
  searchParams: Promise<{ integration?: string }>;
}) {
  const { stopId } = await params;
  const { integration } = await searchParams;

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
    accommodationQuotes,
    transportQuotes,
  } = data;

  const [covers, preferences] = await Promise.all([
    getTripCityCovers(stop.trip_id),
    getTripPreferences(stop.trip_id),
  ]);
  const cover = covers.find((item) => item.stop_id === stop.id);
  const city = stop.city || stop.name || "Cidade";
  const accommodationPlace =
    accommodation?.place && !Array.isArray(accommodation.place) ? accommodation.place : null;

  const heroStyle = cover
    ? {
        backgroundImage: `linear-gradient(180deg, rgba(7,28,35,.08), rgba(7,28,35,.72)), url("${cover.image_url.replace(/"/g, "%22")}")`,
      }
    : undefined;

  const departureBufferMinutes = outbound
    ? outbound.mode === "flight"
      ? preferences?.airport_buffer_minutes ?? 120
      : preferences?.terminal_buffer_minutes ?? 45
    : null;
  const terminalDeadline = outbound?.departure_at && departureBufferMinutes != null
    ? new Date(new Date(outbound.departure_at).getTime() - departureBufferMinutes * 60_000).toISOString()
    : null;
  const departureCheckpoint = outbound?.mode === "flight" ? "aeroporto" : "terminal";
  const inboundTerminalMapsUrl = terminalMapsUrl(
    inbound?.destination_terminal_name,
    inbound?.destination_terminal_address
  );
  const outboundTerminalMapsUrl = terminalMapsUrl(
    outbound?.origin_terminal_name,
    outbound?.origin_terminal_address
  );
  const outboundDate = outbound?.departure_at
    ? String(outbound.departure_at).slice(0, 10)
    : outbound?.departure_date
      ? String(outbound.departure_date)
      : "";
  const accommodationSearchCheckIn = accommodation?.check_in_date
    ? String(accommodation.check_in_date)
    : stop.start_date
      ? String(stop.start_date)
      : "";
  const accommodationSearchCheckOut = accommodation?.check_out_date
    ? String(accommodation.check_out_date)
    : outboundDate && (!accommodationSearchCheckIn || outboundDate > accommodationSearchCheckIn)
      ? outboundDate
      : "";

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
                {(inbound.destination_terminal_name || inbound.destination_terminal_address) && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="text-[12px] leading-5 text-muted">
                      {[inbound.destination_terminal_name, inbound.destination_terminal_address].filter(Boolean).join(" · ")}
                    </p>
                    {inboundTerminalMapsUrl && (
                      <a
                        href={inboundTerminalMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="map-external-link"
                      >
                        Abrir no mapa
                      </a>
                    )}
                  </div>
                )}
                {(inbound.has_checked_baggage || inbound.baggage_notes) && (
                  <p className="mt-1 text-[12px] leading-5 text-muted">
                    {inbound.has_checked_baggage ? "Bagagem incluída" : "Bagagem a confirmar"}
                    {inbound.baggage_notes ? ` · ${String(inbound.baggage_notes)}` : ""}
                  </p>
                )}
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
                      { name: "departure_at", label: "Saída exata", type: "datetime-local" },
                      { name: "arrival_at", label: "Chegada exata", type: "datetime-local" },
                      { name: "departure_date", label: "Data da saída, se horário pendente", type: "date" },
                      { name: "arrival_date", label: "Data da chegada, se horário pendente", type: "date" },
                      { name: "origin_terminal_name", label: "Terminal de saída" },
                      { name: "origin_terminal_address", label: "Endereço da saída" },
                      { name: "destination_terminal_name", label: "Terminal de chegada" },
                      { name: "destination_terminal_address", label: "Endereço da chegada" },
                      { name: "operator", label: "Empresa" },
                      { name: "service_class", label: "Classe" },
                      { name: "booking_reference", label: "Localizador" },
                      { name: "amount", label: "Valor", type: "number", min: "0", step: "0.01" },
                      { name: "source_url", label: "Link", type: "url" },
                      { name: "has_checked_baggage", label: "Inclui bagagem despachada ou no bagageiro", type: "checkbox" },
                      { name: "baggage_notes", label: "Bagagem", type: "textarea" },
                      { name: "notes", label: "Nota", type: "textarea" },
                    ]}
                    values={{
                      origin_label: inbound.origin_label ?? null,
                      destination_label: inbound.destination_label ?? city,
                      departure_at: inbound.departure_at ?? null,
                      arrival_at: inbound.arrival_at ?? null,
                      departure_date: inbound.departure_date ?? null,
                      arrival_date: inbound.arrival_date ?? null,
                      origin_terminal_name: inbound.origin_terminal_name ?? null,
                      origin_terminal_address: inbound.origin_terminal_address ?? null,
                      destination_terminal_name: inbound.destination_terminal_name ?? null,
                      destination_terminal_address: inbound.destination_terminal_address ?? null,
                      operator: inbound.operator ?? null,
                      service_class: inbound.service_class ?? null,
                      booking_reference: inbound.booking_reference ?? null,
                      amount: inbound.amount ?? null,
                      source_url: inbound.source_url ?? null,
                      has_checked_baggage: Boolean(inbound.has_checked_baggage),
                      baggage_notes: inbound.baggage_notes ?? null,
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

      <section id="hospedagem">
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
                {(accommodation.check_in_date || accommodation.check_out_date || accommodation.check_in_from || accommodation.check_out_until) && (
                  <p className="mt-1 text-[12px] leading-5 text-muted">
                    {accommodation.check_in_date ? `Check-in ${formatDate(accommodation.check_in_date)}` : "Check-in pendente"}
                    {accommodation.check_in_from ? ` a partir de ${String(accommodation.check_in_from).slice(0, 5)}` : ""}
                    {" · "}
                    {accommodation.check_out_date ? `Check-out ${formatDate(accommodation.check_out_date)}` : "Check-out pendente"}
                    {accommodation.check_out_until ? ` até ${String(accommodation.check_out_until).slice(0, 5)}` : ""}
                  </p>
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
                  <AccommodationEditor
                    tripId={stop.trip_id}
                    accommodation={{
                      id: String(accommodation.id),
                      name: String(accommodation.name || "Hospedagem"),
                      accommodation_type: accommodation.accommodation_type ?? null,
                      status: accommodation.status ?? null,
                      check_in_date: accommodation.check_in_date ?? null,
                      check_out_date: accommodation.check_out_date ?? null,
                      check_in_from: accommodation.check_in_from ?? null,
                      check_out_until: accommodation.check_out_until ?? null,
                      source_url: accommodation.source_url ?? null,
                      notes: accommodation.notes ?? null,
                    }}
                    address={accommodationPlace?.address ? String(accommodationPlace.address) : null}
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

        <AccommodationSearch
          tripId={stop.trip_id}
          stopId={stop.id}
          city={city}
          defaultCheckIn={accommodationSearchCheckIn}
          defaultCheckOut={accommodationSearchCheckOut}
          currentAccommodationId={accommodation?.id ? String(accommodation.id) : null}
          currentAccommodationStatus={accommodation?.status ? String(accommodation.status) : null}
          defaultOpen={integration === "lodging"}
          initialQuotes={accommodationQuotes.map((quote) => ({
            id: String(quote.id),
            externalId: quote.external_id ? String(quote.external_id) : null,
            name: String(quote.name),
            sourceUrl: quote.source_url ? String(quote.source_url) : null,
            checkInDate: String(quote.check_in_date),
            checkOutDate: String(quote.check_out_date),
            totalAmount: quote.total_amount == null ? null : Number(quote.total_amount),
            currency: String(quote.currency || "BRL"),
            reviewScore: quote.review_score == null ? null : Number(quote.review_score),
            reviewCount: quote.review_count == null ? null : Number(quote.review_count),
            address: quote.address ? String(quote.address) : null,
            latitude: quote.latitude == null ? null : Number(quote.latitude),
            longitude: quote.longitude == null ? null : Number(quote.longitude),
            queriedAt: String(quote.queried_at),
          }))}
        />
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

      <section id="saida" className="pb-2">
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
                {(outbound.origin_terminal_name || outbound.origin_terminal_address) && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="text-[12px] leading-5 text-muted">
                      {[outbound.origin_terminal_name, outbound.origin_terminal_address].filter(Boolean).join(" · ")}
                    </p>
                    {outboundTerminalMapsUrl && (
                      <a
                        href={outboundTerminalMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="map-external-link"
                      >
                        Abrir no mapa
                      </a>
                    )}
                  </div>
                )}
                {terminalDeadline && departureBufferMinutes != null && (
                  <div className="departure-deadline">
                    <strong>Estar no {departureCheckpoint} até {formatTime(terminalDeadline)}</strong>
                    <span>{departureBufferMinutes} min de folga antes da saída. O tempo de trajeto até lá ainda não está incluído.</span>
                  </div>
                )}
                {(outbound.has_checked_baggage || outbound.baggage_notes) && (
                  <p className="mt-1 text-[12px] leading-5 text-muted">
                    {outbound.has_checked_baggage ? "Bagagem incluída" : "Bagagem a confirmar"}
                    {outbound.baggage_notes ? ` · ${String(outbound.baggage_notes)}` : ""}
                  </p>
                )}
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
                      { name: "departure_at", label: "Saída exata", type: "datetime-local" },
                      { name: "arrival_at", label: "Chegada exata", type: "datetime-local" },
                      { name: "departure_date", label: "Data da saída, se horário pendente", type: "date" },
                      { name: "arrival_date", label: "Data da chegada, se horário pendente", type: "date" },
                      { name: "origin_terminal_name", label: "Terminal de saída" },
                      { name: "origin_terminal_address", label: "Endereço da saída" },
                      { name: "destination_terminal_name", label: "Terminal de chegada" },
                      { name: "destination_terminal_address", label: "Endereço da chegada" },
                      { name: "operator", label: "Empresa" },
                      { name: "service_class", label: "Classe" },
                      { name: "booking_reference", label: "Localizador" },
                      { name: "amount", label: "Valor", type: "number", min: "0", step: "0.01" },
                      { name: "source_url", label: "Link", type: "url" },
                      { name: "has_checked_baggage", label: "Inclui bagagem despachada ou no bagageiro", type: "checkbox" },
                      { name: "baggage_notes", label: "Bagagem", type: "textarea" },
                      { name: "notes", label: "Nota", type: "textarea" },
                    ]}
                    values={{
                      origin_label: outbound.origin_label ?? city,
                      destination_label: outbound.destination_label ?? null,
                      departure_at: outbound.departure_at ?? null,
                      arrival_at: outbound.arrival_at ?? null,
                      departure_date: outbound.departure_date ?? null,
                      arrival_date: outbound.arrival_date ?? null,
                      origin_terminal_name: outbound.origin_terminal_name ?? null,
                      origin_terminal_address: outbound.origin_terminal_address ?? null,
                      destination_terminal_name: outbound.destination_terminal_name ?? null,
                      destination_terminal_address: outbound.destination_terminal_address ?? null,
                      operator: outbound.operator ?? null,
                      service_class: outbound.service_class ?? null,
                      booking_reference: outbound.booking_reference ?? null,
                      amount: outbound.amount ?? null,
                      source_url: outbound.source_url ?? null,
                      has_checked_baggage: Boolean(outbound.has_checked_baggage),
                      baggage_notes: outbound.baggage_notes ?? null,
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

        {outbound?.mode === "bus" && outbound.origin_stop_id && outbound.destination_stop_id && (
          <BusSearch
            tripId={stop.trip_id}
            transportId={String(outbound.id)}
            originLabel={city}
            destinationLabel={valueText(outbound.destination_label) || "Próximo destino"}
            transportStatus={String(outbound.status || "planned")}
            defaultOpen={integration === "bus"}
            initialQuotes={transportQuotes.map((quote) => ({
              id: String(quote.id),
              externalId: quote.external_id ? String(quote.external_id) : null,
              departureAt: quote.departure_at ? String(quote.departure_at) : null,
              arrivalAt: quote.arrival_at ? String(quote.arrival_at) : null,
              durationMinutes: quote.duration_minutes == null ? null : Number(quote.duration_minutes),
              operator: quote.operator ? String(quote.operator) : null,
              serviceClass: quote.service_class ? String(quote.service_class) : null,
              originTerminalName: quote.origin_terminal_name ? String(quote.origin_terminal_name) : null,
              destinationTerminalName: quote.destination_terminal_name ? String(quote.destination_terminal_name) : null,
              farePerPassenger: quote.total_amount == null ? null : Number(quote.total_amount),
              currency: String(quote.currency || "BRL"),
              seatsAvailable: quote.seats_available == null ? null : Number(quote.seats_available),
              sourceUrl: quote.source_url ? String(quote.source_url) : null,
              queriedAt: String(quote.queried_at),
            }))}
          />
        )}
      </section>
    </div>
  );
}
