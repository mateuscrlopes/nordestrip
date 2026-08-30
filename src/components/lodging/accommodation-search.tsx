"use client";

import type { ScrappaAccommodationResult } from "@/lib/integrations/scrappa";
import { formatDateTime, formatMoney } from "@/lib/utils/format";
import { ExternalLink, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

export type SavedAccommodationQuote = {
  id: string;
  externalId: string | null;
  name: string;
  sourceUrl: string | null;
  checkInDate: string;
  checkOutDate: string;
  totalAmount: number | null;
  currency: string;
  reviewScore: number | null;
  reviewCount: number | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  queriedAt: string;
};

function resultKey(result: ScrappaAccommodationResult) {
  return result.externalId || result.sourceUrl || `${result.name}|${result.address || ""}`;
}

function quoteSummary(
  totalAmount: number | null,
  currency: string,
  priceLabel?: string | null
) {
  if (totalAmount != null && currency === "BRL") return formatMoney(totalAmount);
  if (priceLabel) return priceLabel;
  return "Preço não informado";
}

async function errorFrom(response: Response, fallback: string) {
  try {
    const data = await response.json() as { error?: unknown };
    return typeof data.error === "string" ? data.error : fallback;
  } catch {
    return fallback;
  }
}

export function AccommodationSearch({
  tripId,
  stopId,
  city,
  defaultCheckIn,
  defaultCheckOut,
  currentAccommodationId,
  currentAccommodationStatus,
  initialQuotes,
}: {
  tripId: string;
  stopId: string;
  city: string;
  defaultCheckIn: string;
  defaultCheckOut: string;
  currentAccommodationId?: string | null;
  currentAccommodationStatus?: string | null;
  initialQuotes: SavedAccommodationQuote[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [checkOut, setCheckOut] = useState(defaultCheckOut);
  const [adults, setAdults] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ScrappaAccommodationResult[]>([]);
  const [quotes, setQuotes] = useState(initialQuotes);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const protectedAccommodation = ["reserved", "confirmed", "completed"].includes(currentAccommodationStatus || "");

  const savedKeys = useMemo(
    () => new Set(quotes.map((quote) => quote.externalId || quote.sourceUrl || `${quote.name}|${quote.address || ""}`)),
    [quotes]
  );

  function sessionExpired() {
    const next = window.location.pathname + window.location.search;
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!checkIn || !checkOut) {
      setMessage("Informe check-in e check-out.");
      return;
    }
    if (checkOut <= checkIn) {
      setMessage("O check-out precisa ser posterior ao check-in.");
      return;
    }

    setSearching(true);
    try {
      const response = await fetch("/api/integrations/scrappa/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          stopId,
          checkIn,
          checkOut,
          adults,
          rooms,
        }),
      });

      if (response.status === 401) {
        sessionExpired();
        return;
      }
      if (!response.ok) {
        throw new Error(await errorFrom(response, "Não foi possível pesquisar hospedagens."));
      }

      const data = await response.json() as { results?: ScrappaAccommodationResult[] };
      const nextResults = Array.isArray(data.results) ? data.results : [];
      setResults(nextResults);
      setMessage(
        nextResults.length
          ? `${nextResults.length} opções encontradas para ${city}.`
          : "A Booking não retornou opções para essas datas."
      );
    } catch (error) {
      setResults([]);
      setMessage(error instanceof Error ? error.message : "Não foi possível pesquisar hospedagens.");
    } finally {
      setSearching(false);
    }
  }

  async function saveResult(result: ScrappaAccommodationResult) {
    const key = resultKey(result);
    setBusyKey(key);
    setMessage("");

    try {
      const response = await fetch("/api/integrations/scrappa/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          stopId,
          checkIn,
          checkOut,
          result,
        }),
      });

      if (response.status === 401) {
        sessionExpired();
        throw new Error("Sessão expirada.");
      }
      if (!response.ok) {
        throw new Error(await errorFrom(response, "Não foi possível salvar esta opção."));
      }

      const data = await response.json() as { quote?: Record<string, unknown> };
      const quote = data.quote;
      if (!quote || typeof quote.id !== "string") {
        throw new Error("A opção foi salva, mas a resposta veio incompleta.");
      }

      const saved: SavedAccommodationQuote = {
        id: quote.id,
        externalId: typeof quote.external_id === "string" ? quote.external_id : null,
        name: typeof quote.name === "string" ? quote.name : result.name,
        sourceUrl: typeof quote.source_url === "string" ? quote.source_url : null,
        checkInDate: typeof quote.check_in_date === "string" ? quote.check_in_date : checkIn,
        checkOutDate: typeof quote.check_out_date === "string" ? quote.check_out_date : checkOut,
        totalAmount: typeof quote.total_amount === "number" ? quote.total_amount : quote.total_amount == null ? null : Number(quote.total_amount),
        currency: typeof quote.currency === "string" ? quote.currency : "BRL",
        reviewScore: typeof quote.review_score === "number" ? quote.review_score : quote.review_score == null ? null : Number(quote.review_score),
        reviewCount: typeof quote.review_count === "number" ? quote.review_count : quote.review_count == null ? null : Number(quote.review_count),
        address: typeof quote.address === "string" ? quote.address : null,
        latitude: typeof quote.latitude === "number" ? quote.latitude : quote.latitude == null ? null : Number(quote.latitude),
        longitude: typeof quote.longitude === "number" ? quote.longitude : quote.longitude == null ? null : Number(quote.longitude),
        queriedAt: typeof quote.queried_at === "string" ? quote.queried_at : new Date().toISOString(),
      };

      setQuotes((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setMessage("Opção salva.");
      return saved;
    } finally {
      setBusyKey(null);
    }
  }

  async function chooseQuote(quoteId: string, key: string) {
    if (protectedAccommodation) {
      setMessage("A hospedagem atual já está reservada ou confirmada e não será substituída automaticamente.");
      return;
    }

    setBusyKey(key);
    setMessage("");

    try {
      const response = await fetch("/api/integrations/scrappa/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          stopId,
          quoteId,
          currentAccommodationId: currentAccommodationId || null,
        }),
      });

      if (response.status === 401) {
        sessionExpired();
        return;
      }
      if (!response.ok) {
        throw new Error(await errorFrom(response, "Não foi possível escolher esta hospedagem."));
      }

      setMessage("Hospedagem selecionada.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível escolher esta hospedagem.");
    } finally {
      setBusyKey(null);
    }
  }

  async function chooseResult(result: ScrappaAccommodationResult) {
    const key = resultKey(result);
    try {
      const saved = await saveResult(result);
      if (saved) await chooseQuote(saved.id, key);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível escolher esta hospedagem.");
      setBusyKey(null);
    }
  }

  return (
    <div className="mt-4 border-t border-petrol/8 pt-4">
      <button
        type="button"
        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-pale-blue/55 px-3 text-[11px] font-semibold text-petrol"
        onClick={() => setOpen((value) => !value)}
      >
        <Search size={15} />
        {open ? "Fechar pesquisa" : "Pesquisar na Booking"}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <form onSubmit={search} className="rounded-[18px] bg-sand/55 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="add-field">
                <span>Check-in</span>
                <input type="date" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} required />
              </label>
              <label className="add-field">
                <span>Check-out</span>
                <input type="date" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} required />
              </label>
              <label className="add-field">
                <span>Adultos</span>
                <input type="number" min={1} max={30} value={adults} onChange={(event) => setAdults(Number(event.target.value) || 1)} />
              </label>
              <label className="add-field">
                <span>Quartos</span>
                <input type="number" min={1} max={30} value={rooms} onChange={(event) => setRooms(Number(event.target.value) || 1)} />
              </label>
            </div>
            <button type="submit" className="add-primary mt-3" disabled={searching}>
              {searching ? "Buscando..." : `Buscar hospedagens em ${city}`}
            </button>
          </form>

          {message && <p role="status" className="text-[11px] leading-5 text-muted">{message}</p>}

          {results.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-petrol/55">Resultados</p>
              <div className="space-y-2">
                {results.map((result) => {
                  const key = resultKey(result);
                  const saved = savedKeys.has(key);
                  return (
                    <article key={key} className="rounded-[18px] border border-petrol/8 bg-white/75 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold">{result.name}</p>
                          {result.address && <p className="mt-1 text-[11px] leading-4 text-muted">{result.address}</p>}
                          <p className="mt-1 text-[11px] text-muted">
                            {quoteSummary(result.totalAmount, result.currency, result.priceLabel)}
                            {result.reviewScore != null ? ` · Nota ${result.reviewScore}` : ""}
                            {result.reviewCount != null ? ` (${result.reviewCount})` : ""}
                          </p>
                        </div>
                        {result.sourceUrl && (
                          <a href={result.sourceUrl} target="_blank" rel="noreferrer" className="map-external-link shrink-0">
                            <ExternalLink size={13} />
                            Booking
                          </a>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-xl bg-pale-blue/55 px-2.5 py-2 text-[10px] font-semibold text-petrol disabled:opacity-55"
                          disabled={busyKey === key || saved}
                          onClick={() => saveResult(result).catch((error) => setMessage(error instanceof Error ? error.message : "Não foi possível salvar esta opção."))}
                        >
                          {saved ? "Salva" : busyKey === key ? "Salvando..." : "Salvar opção"}
                        </button>
                        <button
                          type="button"
                          className="rounded-xl bg-petrol px-2.5 py-2 text-[10px] font-semibold text-white disabled:opacity-45"
                          disabled={busyKey === key || protectedAccommodation}
                          onClick={() => chooseResult(result)}
                        >
                          Escolher
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {quotes.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-petrol/55">Opções salvas</p>
              <div className="space-y-2">
                {quotes.map((quote) => (
                  <article key={quote.id} className="rounded-[18px] bg-surface/75 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold">{quote.name}</p>
                        {quote.address && <p className="mt-1 text-[11px] leading-4 text-muted">{quote.address}</p>}
                        <p className="mt-1 text-[11px] text-muted">
                          {quoteSummary(quote.totalAmount, quote.currency)}
                          {quote.reviewScore != null ? ` · Nota ${quote.reviewScore}` : ""}
                        </p>
                        <p className="mt-1 text-[10px] text-muted">Consultada {formatDateTime(quote.queriedAt)}</p>
                      </div>
                      {quote.sourceUrl && (
                        <a href={quote.sourceUrl} target="_blank" rel="noreferrer" className="map-external-link shrink-0">
                          Booking
                        </a>
                      )}
                    </div>
                    <button
                      type="button"
                      className="mt-3 rounded-xl bg-petrol px-2.5 py-2 text-[10px] font-semibold text-white disabled:opacity-45"
                      disabled={busyKey === quote.id || protectedAccommodation}
                      onClick={() => chooseQuote(quote.id, quote.id)}
                    >
                      {busyKey === quote.id ? "Salvando..." : "Escolher esta opção"}
                    </button>
                  </article>
                ))}
              </div>
            </div>
          )}

          {protectedAccommodation && (
            <p className="text-[10px] leading-4 text-muted">
              A hospedagem atual já está reservada ou confirmada. A pesquisa continua disponível para comparação, mas o Nordestrip não a substitui automaticamente.
            </p>
          )}

          <p className="text-[10px] leading-4 text-muted">
            Os preços são referências visíveis na Booking no momento da consulta. A confirmação e a compra continuam no fornecedor.
          </p>
        </div>
      )}
    </div>
  );
}
