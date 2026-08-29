"use client";

import { createClient } from "@/lib/supabase/client";
import type { ItineraryItem, Stop, Transport } from "@/types/trip";
import {
  CalendarPlus,
  Check,
  Clock3,
  ExternalLink,
  MapPin,
  Search,
  ShieldCheck,
  Star,
  TriangleAlert,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type PlaceLink = {
  id: string;
  platform?: string | null;
  url: string;
  label?: string | null;
  metadata?: Record<string, unknown> | null;
};

type CatalogPlace = {
  id: string;
  stop_id?: string | null;
  name: string;
  category?: string | null;
  address?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  source?: string | null;
  source_url?: string | null;
  opening_hours?: Record<string, unknown> | null;
  last_verified_at?: string | null;
  notes?: string | null;
  links?: PlaceLink[] | null;
};

type CatalogItineraryItem = ItineraryItem & {
  place_id?: string | null;
  item_type?: string | null;
  priority?: string | null;
  status?: string | null;
  duration_min?: number | null;
  duration_max?: number | null;
};

type DateAssessment = {
  date: string;
  score: number;
  blocked: boolean;
  label: string;
  dayItems: CatalogItineraryItem[];
  fixedCount: number;
  totalMinutes: number;
};

const categoryLabels: Record<string, string> = {
  attraction: "Atrações",
  historic: "História",
  museum: "Museus",
  beach: "Praias",
  viewpoint: "Mirantes",
  park: "Parques",
  market: "Mercados",
  excursion: "Passeios",
  restaurant: "Restaurantes",
  cafe: "Cafés",
  bakery: "Padarias",
  bar: "Bares",
  other: "Outros",
};

const weekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function metadataFor(place: CatalogPlace) {
  for (const link of place.links ?? []) {
    if (link.metadata && Object.keys(link.metadata).length) return link.metadata;
  }
  return {} as Record<string, unknown>;
}

function rangeDates(start?: string | null, end?: string | null) {
  if (!start) return [];
  const finalDate = end || start;
  const current = new Date(`${start}T12:00:00Z`);
  const final = new Date(`${finalDate}T12:00:00Z`);
  const dates: string[] = [];

  while (current <= final) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function currentHours(place: CatalogPlace, date: string) {
  const hours = place.opening_hours;
  if (!hours) return null;
  if (hours.always_open === true) return "Acesso livre";

  const weekly = hours.weekly;
  if (!weekly || typeof weekly !== "object" || Array.isArray(weekly)) return null;

  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const key = weekdayKeys[day];
  const slots = (weekly as Record<string, unknown>)[key];

  if (!Array.isArray(slots)) return null;
  if (!slots.length) return "Fechado pelo horário atual";

  const labels = slots
    .filter((slot) => Array.isArray(slot) && slot.length >= 2)
    .map((slot) => `${String(slot[0])}–${String(slot[1])}`);

  return labels.length ? labels.join(" / ") : null;
}

function sourceUrl(place: CatalogPlace) {
  return place.source_url || place.links?.find((link) => link.url)?.url || null;
}

function mapsUrl(place: CatalogPlace) {
  const lat = place.latitude == null ? null : Number(place.latitude);
  const lng = place.longitude == null ? null : Number(place.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
  }

  const query = [place.name, place.address].filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

function confidenceMeta(place: CatalogPlace) {
  const metadata = metadataFor(place);
  const confidence = typeof metadata.confidence === "string" ? metadata.confidence : "reconfirm";
  if (confidence === "verified") {
    return { label: "Fonte oficial verificada", className: "place-confidence place-confidence--verified", icon: ShieldCheck };
  }
  if (confidence === "conditional") {
    return { label: "Depende de condição", className: "place-confidence place-confidence--conditional", icon: TriangleAlert };
  }
  return { label: "Reconfirmar perto da viagem", className: "place-confidence place-confidence--reconfirm", icon: Clock3 };
}

function priceText(place: CatalogPlace) {
  const metadata = metadataFor(place);
  const price = metadata.price;
  if (!price || typeof price !== "object" || Array.isArray(price)) return null;
  const priceRecord = price as Record<string, unknown>;
  if (typeof priceRecord.note === "string") return priceRecord.note;
  if (typeof priceRecord.amount === "number") {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(priceRecord.amount);
  }
  return null;
}

function conditionText(place: CatalogPlace) {
  const condition = metadataFor(place).condition;
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) return null;
  const note = (condition as Record<string, unknown>).note;
  return typeof note === "string" ? note : null;
}

function ratingText(place: CatalogPlace) {
  const metadata = metadataFor(place);
  const rating = typeof metadata.rating === "number" ? metadata.rating : null;
  const reviews = typeof metadata.review_count === "number" ? metadata.review_count : null;
  if (rating == null) return null;

  const reviewLabel = reviews == null
    ? null
    : new Intl.NumberFormat("pt-BR").format(reviews) + (reviews === 1 ? " avaliação" : " avaliações");

  return { rating: rating.toFixed(1).replace(".", ","), reviewLabel };
}

function cuisineText(place: CatalogPlace) {
  const value = metadataFor(place).cuisine;
  return typeof value === "string" ? value : null;
}

function mealTagsText(place: CatalogPlace) {
  const value = metadataFor(place).meal_tags;
  if (!Array.isArray(value)) return null;
  const labels = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return labels.length ? labels.join(" · ") : null;
}

function areaText(place: CatalogPlace) {
  const value = metadataFor(place).area_label;
  return typeof value === "string" ? value : null;
}

function durationValues(place: CatalogPlace) {
  const metadata = metadataFor(place);
  const min = typeof metadata.duration_min === "number" ? metadata.duration_min : null;
  const max = typeof metadata.duration_max === "number" ? metadata.duration_max : null;
  return { min, max };
}

function mealCategory(category?: string | null) {
  return ["restaurant", "cafe", "bakery", "bar"].includes(category || "");
}

function assessDate(
  place: CatalogPlace,
  date: string,
  stopId: string,
  itinerary: CatalogItineraryItem[],
  transports: Transport[]
): DateAssessment {
  const dayItems = itinerary.filter(
    (item) => item.stop_id === stopId && item.activity_date === date && item.status !== "cancelled"
  );
  const fixedCount = dayItems.filter((item) => item.is_anchor).length;
  const totalMinutes = dayItems.reduce((total, item) => {
    const estimate = item.duration_max ?? item.duration_min ?? (item.is_anchor ? 90 : 60);
    return total + estimate;
  }, 0);
  const hasFullDay = dayItems.some(
    (item) =>
      item.priority === "high" &&
      Math.max(item.duration_max ?? 0, item.duration_min ?? 0) >= 360
  );
  const arrivalDay = transports.some(
    (transport) =>
      transport.status !== "cancelled" &&
      transport.destination_stop_id === stopId &&
      transport.arrival_date === date
  );
  const departureDay = transports.some(
    (transport) =>
      transport.status !== "cancelled" &&
      transport.origin_stop_id === stopId &&
      transport.departure_date === date
  );
  const hours = currentHours(place, date);
  const blocked = hours === "Fechado pelo horário atual";

  if (blocked) {
    return { date, score: -1000, blocked: true, label: "Fechado neste dia", dayItems, fixedCount, totalMinutes };
  }

  let score = 100;
  score -= Math.min(Math.round(totalMinutes / 20), 45);
  score -= fixedCount * 16;
  if (hasFullDay) score -= 65;
  if (arrivalDay) score -= 12;
  if (departureDay) score -= 20;

  let label = "Mais espaço no roteiro";
  if (hasFullDay) label = "Dia já tem passeio principal";
  else if (arrivalDay && departureDay) label = "Chegada e saída no mesmo dia";
  else if (departureDay) label = "Tem saída da cidade";
  else if (arrivalDay) label = "Tem chegada à cidade";
  else if (fixedCount > 0) label = "Tem compromisso com horário";
  else if (totalMinutes >= 240) label = "Dia já está carregado";

  return { date, score, blocked: false, label, dayItems, fixedCount, totalMinutes };
}

export function PlacesExplorer({
  tripId,
  stops,
  places,
  itinerary,
  transports,
}: {
  tripId: string;
  stops: Stop[];
  places: Record<string, unknown>[];
  itinerary: ItineraryItem[];
  transports: Transport[];
}) {
  const router = useRouter();
  const catalog = places as unknown as CatalogPlace[];
  const currentItinerary = itinerary as CatalogItineraryItem[];
  const firstStopWithPlaces = stops.find((stop) => catalog.some((place) => place.stop_id === stop.id));
  const [activeStopId, setActiveStopId] = useState(firstStopWithPlaces?.id || stops[0]?.id || "");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<CatalogPlace | null>(null);
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const activeStop = stops.find((stop) => stop.id === activeStopId);
  const cityPlaces = catalog.filter((place) => place.stop_id === activeStopId);

  const categories = useMemo(
    () => Array.from(new Set(cityPlaces.map((place) => place.category || "other"))),
    [cityPlaces]
  );

  const visiblePlaces = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    return cityPlaces.filter((place) => {
      const categoryMatches = category === "all" || (place.category || "other") === category;
      const queryMatches =
        !normalizedQuery ||
        [place.name, place.address, place.notes, areaText(place)]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(normalizedQuery));
      return categoryMatches && queryMatches;
    });
  }, [category, cityPlaces, query]);

  const selectedDateAssessments = selectedPlace && activeStop
    ? rangeDates(activeStop.start_date, activeStop.end_date).map((date) =>
        assessDate(selectedPlace, date, activeStop.id, currentItinerary, transports)
      )
    : [];
  const eligibleDateAssessments = selectedDateAssessments.filter((item) => !item.blocked);
  const recommendedDate = eligibleDateAssessments.length > 1
    ? [...eligibleDateAssessments].sort((a, b) => b.score - a.score)[0]?.date ?? null
    : null;

  function chooseStop(stopId: string) {
    setActiveStopId(stopId);
    setCategory("all");
    setQuery("");
  }

  async function addToItinerary(place: CatalogPlace, date: string) {
    if (!place.stop_id) return;
    setSavingDate(date);
    setError("");
    const supabase = createClient();
    const duration = durationValues(place);

    const { error: insertError } = await supabase.from("itinerary_items").insert({
      trip_id: tripId,
      stop_id: place.stop_id,
      place_id: place.id,
      title: place.name,
      item_type: mealCategory(place.category) ? "meal" : "activity",
      activity_date: date,
      schedule_type: "none",
      period: null,
      start_time: null,
      end_time: null,
      duration_min: duration.min,
      duration_max: duration.max,
      priority: "medium",
      status: "planned",
      is_anchor: false,
      notes: null,
    });

    if (insertError) {
      setError(insertError.message);
      setSavingDate(null);
      return;
    }

    await supabase
      .from("discoveries")
      .update({ status: "converted" })
      .eq("trip_id", tripId)
      .eq("place_id", place.id)
      .in("status", ["saved", "reviewing"]);

    setSavingDate(null);
    setSelectedPlace(null);
    setNotice(`${place.name} entrou no roteiro`);
    router.refresh();
    window.setTimeout(() => setNotice(""), 2200);
  }

  return (
    <>
      <div className="places-city-tabs" aria-label="Cidades da viagem">
        {stops.map((stop) => {
          const count = catalog.filter((place) => place.stop_id === stop.id).length;
          return (
            <button
              key={stop.id}
              type="button"
              className={activeStopId === stop.id ? "is-active" : ""}
              onClick={() => chooseStop(stop.id)}
            >
              <strong>{stop.city || stop.name || "Cidade"}</strong>
              <span>{count} {count === 1 ? "local" : "locais"}</span>
            </button>
          );
        })}
      </div>

      {activeStop && (
        <div className="places-city-context">
          <div>
            <p>Na viagem</p>
            <strong>{activeStop.city || activeStop.name || "Cidade"}</strong>
          </div>
          <span>
            {activeStop.start_date ? dateLabel(activeStop.start_date) : "Data pendente"}
            {activeStop.end_date && activeStop.end_date !== activeStop.start_date
              ? ` → ${dateLabel(activeStop.end_date)}`
              : ""}
          </span>
        </div>
      )}

      <div className="places-tools">
        <label className="places-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar nesta cidade"
            aria-label="Buscar locais"
          />
        </label>
        <div className="places-category-tabs">
          <button type="button" className={category === "all" ? "is-active" : ""} onClick={() => setCategory("all")}>
            Todos
          </button>
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              className={category === item ? "is-active" : ""}
              onClick={() => setCategory(item)}
            >
              {categoryLabels[item] || item}
            </button>
          ))}
        </div>
      </div>

      {visiblePlaces.length ? (
        <div className="places-catalog">
          {visiblePlaces.map((place) => {
            const confidence = confidenceMeta(place);
            const ConfidenceIcon = confidence.icon;
            const price = priceText(place);
            const condition = conditionText(place);
            const rating = ratingText(place);
            const cuisine = cuisineText(place);
            const mealTags = mealTagsText(place);
            const area = areaText(place);
            const stop = stops.find((item) => item.id === place.stop_id);
            const travelDates = rangeDates(stop?.start_date, stop?.end_date);
            const officialSource = sourceUrl(place);
            const map = mapsUrl(place);

            return (
              <article key={place.id} className="place-catalog-card">
                <div className="place-catalog-topline">
                  <span>{categoryLabels[place.category || "other"] || place.category || "Local"}</span>
                  {area && <em>{area}</em>}
                </div>

                <h2>{place.name}</h2>
                {place.notes && <p className="place-catalog-description">{place.notes}</p>}

                <div className="place-confidence-row">
                  <span className={confidence.className}>
                    <ConfidenceIcon size={12} />
                    {confidence.label}
                  </span>
                  {place.last_verified_at && (
                    <small>
                      verificado {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(place.last_verified_at))}
                    </small>
                  )}
                </div>

                {travelDates.length > 0 && (
                  <div className="place-travel-hours">
                    {travelDates.map((date) => {
                      const hours = currentHours(place, date);
                      return (
                        <div key={date}>
                          <span>{dateLabel(date)}</span>
                          <strong>{hours || "Horário ainda não estruturado"}</strong>
                        </div>
                      );
                    })}
                  </div>
                )}

                {(rating || price || cuisine || mealTags || condition) && (
                  <div className="place-catalog-facts">
                    {rating && (
                      <span className="place-rating">
                        <Star size={11} />
                        {rating.rating}
                        {rating.reviewLabel ? ` · ${rating.reviewLabel}` : ""}
                      </span>
                    )}
                    {price && <span>{price}</span>}
                    {cuisine && <span>{cuisine}</span>}
                    {mealTags && <span>{mealTags}</span>}
                    {condition && <span className="is-warning">{condition}</span>}
                  </div>
                )}

                {place.address && (
                  <p className="place-catalog-address"><MapPin size={13} /> {place.address}</p>
                )}

                <div className="place-catalog-actions">
                  <div>
                    {map && (
                      <a href={map} target="_blank" rel="noreferrer">
                        <MapPin size={14} />
                        Mapa
                      </a>
                    )}
                    {officialSource && (
                      <a href={officialSource} target="_blank" rel="noreferrer">
                        <ExternalLink size={14} />
                        Fonte
                      </a>
                    )}
                  </div>
                  <button type="button" onClick={() => { setSelectedPlace(place); setError(""); }}>
                    <CalendarPlus size={15} />
                    Adicionar ao roteiro
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-surface">
          <MapPin size={20} />
          <p>{cityPlaces.length ? "Nenhum local corresponde aos filtros." : "O catálogo desta cidade ainda está sendo montado."}</p>
        </div>
      )}

      {notice && <div className="add-toast" role="status">{notice}</div>}

      {selectedPlace && (
        <div className="add-overlay" onClick={() => setSelectedPlace(null)}>
          <section className="add-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="add-sheet-header">
              <div>
                <h2>Adicionar ao roteiro</h2>
                <p>{selectedPlace.name}</p>
              </div>
              <button type="button" className="add-icon-button" aria-label="Fechar" onClick={() => setSelectedPlace(null)}>
                <X size={19} />
              </button>
            </div>

            <div className="place-date-options">
              {selectedDateAssessments.map((assessment) => {
                const { date, dayItems, fixedCount, totalMinutes } = assessment;
                const alreadyAdded = dayItems.some((item) => item.place_id === selectedPlace.id);
                const hours = currentHours(selectedPlace, date);
                const isRecommended = recommendedDate === date;

                return (
                  <div key={date} className={`place-date-option ${isRecommended ? "is-recommended" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <div className="place-date-title-line">
                        <strong>{dateLabel(date)}</strong>
                        {isRecommended && <em>Recomendado</em>}
                      </div>
                      <span>
                        {hours || "Horário a confirmar"}
                        {" · "}
                        {assessment.label}
                      </span>
                      {dayItems.length > 0 && (
                        <small>
                          {dayItems.length} {dayItems.length === 1 ? "item" : "itens"} no roteiro
                          {fixedCount ? ` · ${fixedCount} com horário fixo` : ""}
                          {totalMinutes ? ` · até ~${Math.round(totalMinutes / 60)}h planejadas` : ""}
                        </small>
                      )}
                    </div>
                    {alreadyAdded ? (
                      <span className="place-date-added"><Check size={14} /> Já está</span>
                    ) : (
                      <button
                        type="button"
                        disabled={savingDate === date || assessment.blocked}
                        onClick={() => addToItinerary(selectedPlace, date)}
                      >
                        {savingDate === date ? "Adicionando..." : assessment.blocked ? "Fechado" : "Escolher"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="place-date-note">
              A recomendação considera o funcionamento publicado, a carga já planejada e se o dia tem chegada ou saída da cidade. O tempo real entre os locais ainda será refinado quando o mapa integrado estiver ativo.
            </p>
            {error && <p className="add-error" role="alert">{error}</p>}
          </section>
        </div>
      )}
    </>
  );
}
