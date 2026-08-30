"use client";

import { createClient } from "@/lib/supabase/client";
import { formatDate, formatMoney } from "@/lib/utils/format";
import {
  Archive,
  Check,
  Coffee,
  ExternalLink,
  MapPin,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type AccommodationOption = {
  id: string;
  name: string;
  accommodation_type?: string | null;
  breakfast_included?: boolean | null;
  check_in_date: string;
  check_out_date: string;
  check_in_from?: string | null;
  check_out_until?: string | null;
  total_amount?: number | null;
  currency?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  source_url?: string | null;
  notes?: string | null;
};

type GeocodingResult = {
  id: string;
  label: string;
  longitude: number;
  latitude: number;
};

const typeLabel: Record<string, string> = {
  hotel: "Hotel",
  hostel: "Hostel",
  airbnb: "Airbnb",
  apartment: "Apartamento",
  guesthouse: "Pousada",
  other: "Outro",
};

function numberValue(value: FormDataEntryValue | null) {
  const text = String(value || "").trim().replace(",", ".");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function timeValue(value?: string | null) {
  return value ? value.slice(0, 5) : "";
}

function coordinateValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function AccommodationOptions({
  tripId,
  stopId,
  city,
  defaultCheckIn,
  defaultCheckOut,
  selectedOptionId,
  currentAccommodationStatus,
  initialOptions,
}: {
  tripId: string;
  stopId: string;
  city: string;
  defaultCheckIn: string;
  defaultCheckOut: string;
  selectedOptionId?: string | null;
  currentAccommodationStatus?: string | null;
  initialOptions: AccommodationOption[];
}) {
  const router = useRouter();
  const [options, setOptions] = useState(initialOptions);
  const [editing, setEditing] = useState<AccommodationOption | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [addressResults, setAddressResults] = useState<GeocodingResult[]>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);

  const protectedAccommodation = ["reserved", "confirmed", "completed"].includes(currentAccommodationStatus || "");

  function openForm(option?: AccommodationOption) {
    setEditing(option || null);
    setAddress(option?.address || "");
    setLatitude(option?.latitude ?? null);
    setLongitude(option?.longitude ?? null);
    setAddressResults([]);
    setMessage("");
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditing(null);
    setAddressResults([]);
  }

  async function searchAddress() {
    const query = address.trim();
    if (query.length < 3) {
      setMessage("Digite um endereço antes de buscar.");
      return;
    }

    const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    if (!key) {
      setMessage("A busca de endereço ainda não está configurada.");
      return;
    }

    setSearchingAddress(true);
    setMessage("");

    try {
      const params = new URLSearchParams({
        key,
        language: "pt",
        country: "br",
        limit: "5",
        types: "address,poi,road",
      });
      const fullQuery = [query, city, "Brasil"].filter(Boolean).join(", ");
      const response = await fetch(
        `https://api.maptiler.com/geocoding/${encodeURIComponent(fullQuery)}.json?${params.toString()}`
      );
      if (!response.ok) throw new Error("Não foi possível buscar este endereço.");

      const payload = await response.json() as {
        features?: Array<{
          id?: unknown;
          place_name?: unknown;
          text?: unknown;
          center?: unknown;
          geometry?: { coordinates?: unknown };
        }>;
      };

      const results: GeocodingResult[] = [];
      for (const feature of payload.features || []) {
        const coordinates = Array.isArray(feature.center)
          ? feature.center
          : Array.isArray(feature.geometry?.coordinates)
            ? feature.geometry?.coordinates
            : null;
        const lng = coordinateValue(coordinates?.[0]);
        const lat = coordinateValue(coordinates?.[1]);
        const label =
          typeof feature.place_name === "string"
            ? feature.place_name
            : typeof feature.text === "string"
              ? feature.text
              : null;
        if (!label || lat == null || lng == null) continue;
        results.push({
          id: typeof feature.id === "string" ? feature.id : `${lng},${lat}`,
          label,
          longitude: lng,
          latitude: lat,
        });
      }

      setAddressResults(results);
      if (!results.length) setMessage("Nenhum endereço correspondente foi encontrado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível buscar este endereço.");
    } finally {
      setSearchingAddress(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const checkInDate = String(form.get("check_in_date") || "").trim();
    const checkOutDate = String(form.get("check_out_date") || "").trim();

    if (!name || !checkInDate || !checkOutDate) {
      setMessage("Nome, check-in e check-out são obrigatórios.");
      return;
    }
    if (checkOutDate <= checkInDate) {
      setMessage("O check-out precisa ser posterior ao check-in.");
      return;
    }

    setSaving(true);
    setMessage("");

    const payload = {
      trip_id: tripId,
      stop_id: stopId,
      provider: "manual",
      name,
      accommodation_type: String(form.get("accommodation_type") || "hotel"),
      breakfast_included: form.get("breakfast_included") === "on",
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      check_in_from: String(form.get("check_in_from") || "").trim() || null,
      check_out_until: String(form.get("check_out_until") || "").trim() || null,
      total_amount: numberValue(form.get("total_amount")),
      currency: "BRL",
      address: address.trim() || null,
      latitude,
      longitude,
      source_url: String(form.get("source_url") || "").trim() || null,
      notes: String(form.get("notes") || "").trim() || null,
      queried_at: new Date().toISOString(),
      archived_at: null,
    };

    const supabase = createClient();
    const query = editing
      ? supabase
          .from("accommodation_quotes")
          .update(payload)
          .eq("id", editing.id)
          .eq("trip_id", tripId)
          .eq("stop_id", stopId)
          .eq("provider", "manual")
      : supabase.from("accommodation_quotes").insert(payload);

    const { data, error } = await query.select("*").single();

    if (error || !data) {
      setMessage(error?.message || "Não foi possível salvar esta opção.");
      setSaving(false);
      return;
    }

    const saved = data as AccommodationOption;
    setOptions((current) => editing
      ? current.map((option) => option.id === saved.id ? saved : option)
      : [saved, ...current]
    );
    setSaving(false);
    setFormOpen(false);
    setEditing(null);
    setMessage(editing ? "Opção atualizada." : "Opção adicionada.");
  }

  async function archive(option: AccommodationOption) {
    if (!window.confirm(`Arquivar “${option.name}”? A opção não será apagada.`)) return;

    setBusyId(option.id);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase
      .from("accommodation_quotes")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", option.id)
      .eq("trip_id", tripId)
      .eq("stop_id", stopId)
      .eq("provider", "manual");

    if (error) {
      setMessage(error.message);
    } else {
      setOptions((current) => current.filter((item) => item.id !== option.id));
      setMessage("Opção arquivada.");
    }
    setBusyId(null);
  }

  async function choose(option: AccommodationOption) {
    if (protectedAccommodation && selectedOptionId !== option.id) {
      setMessage("A hospedagem atual já está reservada ou confirmada. Edite-a antes de trocar de opção.");
      return;
    }

    setBusyId(option.id);
    setMessage("");

    try {
      const response = await fetch("/api/accommodations/options/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, stopId, quoteId: option.id }),
      });

      if (response.status === 401) {
        const next = window.location.pathname + window.location.search;
        window.location.assign(`/login?next=${encodeURIComponent(next)}`);
        return;
      }

      if (!response.ok) {
        const body = await response.json() as { error?: unknown };
        throw new Error(typeof body.error === "string" ? body.error : "Não foi possível escolher esta opção.");
      }

      setMessage("Hospedagem escolhida.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível escolher esta opção.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-3">
      <div className="-mt-11 mb-3 flex justify-end">
        <button
          type="button"
          className="add-icon-button"
          aria-label="Adicionar opção de hospedagem"
          title="Adicionar opção"
          onClick={() => openForm()}
        >
          <Plus size={18} />
        </button>
      </div>

      {options.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[.08em] text-petrol/55">
            Opções
          </p>
          {options.map((option) => {
            const selected = selectedOptionId === option.id;
            return (
              <article key={option.id} className="rounded-[18px] border border-petrol/8 bg-surface/75 p-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-[13px]">{option.name}</strong>
                      {selected && (
                        <span className="rounded-full bg-pale-blue/60 px-2 py-0.5 text-[9px] font-semibold text-petrol">
                          Escolhida
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-muted">
                      {typeLabel[option.accommodation_type || "hotel"] || "Hospedagem"}
                      {option.total_amount != null ? ` · ${formatMoney(Number(option.total_amount))}` : ""}
                    </p>
                    <p className="mt-1 text-[11px] text-muted">
                      {formatDate(option.check_in_date)}
                      {option.check_in_from ? ` ${timeValue(option.check_in_from)}` : ""}
                      {" → "}
                      {formatDate(option.check_out_date)}
                      {option.check_out_until ? ` ${timeValue(option.check_out_until)}` : ""}
                    </p>
                    {option.breakfast_included && (
                      <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted">
                        <Coffee size={12} /> Café da manhã incluído
                      </p>
                    )}
                    {option.address && (
                      <p className="mt-1 flex items-start gap-1 text-[10px] leading-4 text-muted">
                        <MapPin size={12} className="mt-0.5 shrink-0" />
                        <span>{option.address}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {option.source_url && (
                      <a
                        href={option.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="add-icon-button"
                        aria-label={`Abrir link de ${option.name}`}
                      >
                        <ExternalLink size={15} />
                      </a>
                    )}
                    <button type="button" className="add-icon-button" aria-label={`Editar ${option.name}`} onClick={() => openForm(option)}>
                      <Pencil size={15} />
                    </button>
                    <button type="button" className="add-icon-button" aria-label={`Arquivar ${option.name}`} disabled={busyId === option.id} onClick={() => archive(option)}>
                      <Archive size={15} />
                    </button>
                  </div>
                </div>

                {!selected && (
                  <button
                    type="button"
                    className="mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-xl bg-petrol px-3 text-[10px] font-semibold text-white disabled:opacity-45"
                    disabled={busyId === option.id || protectedAccommodation}
                    onClick={() => choose(option)}
                  >
                    <Check size={13} />
                    Escolher esta opção
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {!options.length && (
        <p className="text-[11px] leading-5 text-muted">
          Salve algumas opções enquanto pesquisa e escolha uma quando decidir.
        </p>
      )}

      {message && <p role="status" className="mt-2 text-[10px] leading-4 text-muted">{message}</p>}

      {formOpen && (
        <div className="edit-overlay" onClick={closeForm}>
          <section className="edit-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="edit-sheet-header">
              <div>
                <p>Hospedagem</p>
                <h2>{editing ? "Editar opção" : "Nova opção"}</h2>
              </div>
              <button type="button" className="add-icon-button" aria-label="Fechar" onClick={closeForm}>
                <X size={19} />
              </button>
            </div>

            <form onSubmit={save} className="add-form">
              <label className="add-field">
                <span>Nome</span>
                <input name="name" required defaultValue={editing?.name || ""} placeholder="Hotel, hostel ou apartamento" />
              </label>

              <div className="add-grid">
                <label className="add-field">
                  <span>Tipo</span>
                  <select name="accommodation_type" defaultValue={editing?.accommodation_type || "hotel"}>
                    <option value="hotel">Hotel</option>
                    <option value="hostel">Hostel</option>
                    <option value="airbnb">Airbnb</option>
                    <option value="apartment">Apartamento</option>
                    <option value="guesthouse">Pousada</option>
                    <option value="other">Outro</option>
                  </select>
                </label>
                <label className="add-field">
                  <span>Valor total</span>
                  <input
                    name="total_amount"
                    inputMode="decimal"
                    defaultValue={editing?.total_amount == null ? "" : String(editing.total_amount)}
                    placeholder="0,00"
                  />
                </label>
              </div>

              <div className="add-grid">
                <label className="add-field">
                  <span>Check-in</span>
                  <input name="check_in_date" type="date" required defaultValue={editing?.check_in_date || defaultCheckIn} />
                </label>
                <label className="add-field">
                  <span>Check-out</span>
                  <input name="check_out_date" type="date" required defaultValue={editing?.check_out_date || defaultCheckOut} />
                </label>
              </div>

              <div className="add-grid">
                <label className="add-field">
                  <span>Check-in a partir de</span>
                  <input name="check_in_from" type="time" defaultValue={timeValue(editing?.check_in_from)} />
                </label>
                <label className="add-field">
                  <span>Check-out até</span>
                  <input name="check_out_until" type="time" defaultValue={timeValue(editing?.check_out_until)} />
                </label>
              </div>

              <label className="add-check">
                <input name="breakfast_included" type="checkbox" defaultChecked={editing?.breakfast_included === true} />
                <span>Café da manhã incluído</span>
              </label>

              <div className="add-field">
                <span>Endereço</span>
                <div className="flex gap-2">
                  <input
                    value={address}
                    onChange={(event) => {
                      setAddress(event.target.value);
                      setLatitude(null);
                      setLongitude(null);
                      setAddressResults([]);
                    }}
                    placeholder="Rua, número, bairro ou nome do lugar"
                  />
                  <button
                    type="button"
                    className="add-icon-button shrink-0"
                    aria-label="Buscar endereço"
                    title="Buscar endereço"
                    disabled={searchingAddress}
                    onClick={searchAddress}
                  >
                    <Search size={17} />
                  </button>
                </div>
                {latitude != null && longitude != null && (
                  <small className="mt-1 block text-[10px] text-muted">Localização confirmada no mapa.</small>
                )}
              </div>

              {addressResults.length > 0 && (
                <div className="space-y-1 rounded-xl bg-sand/50 p-2">
                  {addressResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      className="block w-full rounded-lg px-2 py-2 text-left text-[10px] leading-4 hover:bg-white/70"
                      onClick={() => {
                        setAddress(result.label);
                        setLatitude(result.latitude);
                        setLongitude(result.longitude);
                        setAddressResults([]);
                        setMessage("Endereço confirmado.");
                      }}
                    >
                      {result.label}
                    </button>
                  ))}
                </div>
              )}

              <label className="add-field">
                <span>Link da opção</span>
                <input name="source_url" type="url" inputMode="url" defaultValue={editing?.source_url || ""} placeholder="Site, Booking, Airbnb..." />
              </label>

              <label className="add-field">
                <span>Nota</span>
                <textarea name="notes" rows={3} defaultValue={editing?.notes || ""} placeholder="Cancelamento, quarto, observações..." />
              </label>

              {message && <p className="add-error" role="status">{message}</p>}

              <div className="add-form-actions">
                <button type="button" className="add-secondary" onClick={closeForm}>Cancelar</button>
                <button type="submit" className="add-primary" disabled={saving}>
                  {saving ? "Salvando..." : editing ? "Salvar alterações" : "Adicionar opção"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
