"use client";

import type { GeckoBusResult } from "@/lib/integrations/gecko";
import { formatDateTime, formatMoney } from "@/lib/utils/format";
import { BusFront, ExternalLink, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type SavedTransportQuote = {
  id: string;
  externalId: string | null;
  departureAt: string | null;
  arrivalAt: string | null;
  durationMinutes: number | null;
  operator: string | null;
  serviceClass: string | null;
  originTerminalName: string | null;
  destinationTerminalName: string | null;
  farePerPassenger: number | null;
  currency: string;
  seatsAvailable: number | null;
  sourceUrl: string | null;
  queriedAt: string;
};

function resultKey(result: GeckoBusResult) {
  return result.externalId;
}

function fareLabel(amount: number | null, currency: string) {
  if (amount == null) return "Tarifa não informada";
  return currency === "BRL" ? `${formatMoney(amount)} por passageiro` : `${amount} ${currency} por passageiro`;
}

function durationLabel(minutes: number | null, fallback?: string | null) {
  if (fallback) return fallback;
  if (minutes == null) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

async function errorFrom(response: Response, fallback: string) {
  try {
    const data = await response.json() as { error?: unknown };
    return typeof data.error === "string" ? data.error : fallback;
  } catch {
    return fallback;
  }
}

export function BusSearch({
  tripId,
  transportId,
  originLabel,
  destinationLabel,
  transportStatus,
  initialQuotes,
}: {
  tripId: string;
  transportId: string;
  originLabel: string;
  destinationLabel: string;
  transportStatus: string;
  initialQuotes: SavedTransportQuote[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<GeckoBusResult[]>([]);
  const [quotes, setQuotes] = useState(initialQuotes);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const protectedTransport = ["reserved", "purchased", "confirmed", "completed"].includes(transportStatus);
  const savedIds = useMemo(
    () => new Set(quotes.map((quote) => quote.externalId).filter(Boolean)),
    [quotes]
  );

  function sessionExpired() {
    const next = window.location.pathname + window.location.search;
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  }

  async function search() {
    setSearching(true);
    setMessage("");

    try {
      const response = await fetch("/api/integrations/gecko/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, transportId }),
      });

      if (response.status === 401) {
        sessionExpired();
        return;
      }
      if (!response.ok) {
        throw new Error(await errorFrom(response, "Não foi possível pesquisar ônibus."));
      }

      const data = await response.json() as { results?: GeckoBusResult[] };
      const nextResults = Array.isArray(data.results) ? data.results : [];
      setResults(nextResults);
      setMessage(
        nextResults.length
          ? `${nextResults.length} opções encontradas para ${originLabel} → ${destinationLabel}.`
          : "A ClickBus não retornou opções para esse trecho e data."
      );
    } catch (error) {
      setResults([]);
      setMessage(error instanceof Error ? error.message : "Não foi possível pesquisar ônibus.");
    } finally {
      setSearching(false);
    }
  }

  async function saveResult(result: GeckoBusResult) {
    const key = resultKey(result);
    setBusyKey(key);
    setMessage("");

    try {
      const response = await fetch("/api/integrations/gecko/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, transportId, result }),
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

      const saved: SavedTransportQuote = {
        id: quote.id,
        externalId: typeof quote.external_id === "string" ? quote.external_id : null,
        departureAt: typeof quote.departure_at === "string" ? quote.departure_at : null,
        arrivalAt: typeof quote.arrival_at === "string" ? quote.arrival_at : null,
        durationMinutes: quote.duration_minutes == null ? null : Number(quote.duration_minutes),
        operator: typeof quote.operator === "string" ? quote.operator : null,
        serviceClass: typeof quote.service_class === "string" ? quote.service_class : null,
        originTerminalName: typeof quote.origin_terminal_name === "string" ? quote.origin_terminal_name : null,
        destinationTerminalName: typeof quote.destination_terminal_name === "string" ? quote.destination_terminal_name : null,
        farePerPassenger: quote.total_amount == null ? null : Number(quote.total_amount),
        currency: typeof quote.currency === "string" ? quote.currency : "BRL",
        seatsAvailable: quote.seats_available == null ? null : Number(quote.seats_available),
        sourceUrl: typeof quote.source_url === "string" ? quote.source_url : null,
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
    if (protectedTransport) {
      setMessage("Este transporte já está reservado, comprado ou confirmado e não será substituído automaticamente.");
      return;
    }

    setBusyKey(key);
    setMessage("");

    try {
      const response = await fetch("/api/integrations/gecko/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, transportId, quoteId }),
      });

      if (response.status === 401) {
        sessionExpired();
        return;
      }
      if (!response.ok) {
        throw new Error(await errorFrom(response, "Não foi possível escolher esta opção."));
      }

      setMessage("Opção aplicada ao trecho. O valor exibido continua sendo tarifa por passageiro até a compra.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível escolher esta opção.");
    } finally {
      setBusyKey(null);
    }
  }

  async function chooseResult(result: GeckoBusResult) {
    const key = resultKey(result);
    try {
      const saved = await saveResult(result);
      if (saved) await chooseQuote(saved.id, key);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível escolher esta opção.");
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
        {open ? "Fechar pesquisa" : "Pesquisar ônibus"}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="rounded-[18px] bg-sand/55 p-3">
            <div className="flex items-center gap-2">
              <BusFront size={15} className="text-petrol" />
              <p className="text-[12px] font-semibold">{originLabel} → {destinationLabel}</p>
            </div>
            <button type="button" className="add-primary mt-3" disabled={searching} onClick={search}>
              {searching ? "Buscando..." : "Buscar opções na ClickBus"}
            </button>
          </div>

          {message && <p role="status" className="text-[11px] leading-5 text-muted">{message}</p>}

          {results.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-petrol/55">Resultados</p>
              <div className="space-y-2">
                {results.map((result) => {
                  const key = resultKey(result);
                  const saved = savedIds.has(result.externalId);
                  return (
                    <article key={key} className="rounded-[18px] border border-petrol/8 bg-white/75 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold">
                            {result.operator || "Viação não informada"}
                            {result.serviceClass ? ` · ${result.serviceClass}` : ""}
                          </p>
                          <p className="mt-1 text-[11px] text-muted">
                            {result.departureAt ? formatDateTime(result.departureAt) : "Saída pendente"}
                            {" → "}
                            {result.arrivalAt ? formatDateTime(result.arrivalAt) : "Chegada pendente"}
                          </p>
                          {(result.originTerminalName || result.destinationTerminalName) && (
                            <p className="mt-1 text-[11px] leading-4 text-muted">
                              {[result.originTerminalName, result.destinationTerminalName].filter(Boolean).join(" → ")}
                            </p>
                          )}
                          <p className="mt-1 text-[11px] text-muted">
                            {fareLabel(result.pricePerPassenger, result.currency)}
                            {durationLabel(result.durationMinutes, result.durationText) ? ` · ${durationLabel(result.durationMinutes, result.durationText)}` : ""}
                            {result.seatsAvailable != null ? ` · ${result.seatsAvailable} assentos` : ""}
                          </p>
                        </div>
                        {result.sourceUrl && (
                          <a href={result.sourceUrl} target="_blank" rel="noreferrer" className="map-external-link shrink-0">
                            <ExternalLink size={13} />
                            ClickBus
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
                          disabled={busyKey === key || protectedTransport}
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
                        <p className="text-[13px] font-semibold">
                          {quote.operator || "Viação não informada"}
                          {quote.serviceClass ? ` · ${quote.serviceClass}` : ""}
                        </p>
                        <p className="mt-1 text-[11px] text-muted">
                          {quote.departureAt ? formatDateTime(quote.departureAt) : "Saída pendente"}
                          {" → "}
                          {quote.arrivalAt ? formatDateTime(quote.arrivalAt) : "Chegada pendente"}
                        </p>
                        <p className="mt-1 text-[11px] text-muted">
                          {fareLabel(quote.farePerPassenger, quote.currency)}
                          {quote.seatsAvailable != null ? ` · ${quote.seatsAvailable} assentos` : ""}
                        </p>
                        <p className="mt-1 text-[10px] text-muted">Consultada {formatDateTime(quote.queriedAt)}</p>
                      </div>
                      {quote.sourceUrl && (
                        <a href={quote.sourceUrl} target="_blank" rel="noreferrer" className="map-external-link shrink-0">
                          ClickBus
                        </a>
                      )}
                    </div>
                    <button
                      type="button"
                      className="mt-3 rounded-xl bg-petrol px-2.5 py-2 text-[10px] font-semibold text-white disabled:opacity-45"
                      disabled={busyKey === quote.id || protectedTransport}
                      onClick={() => chooseQuote(quote.id, quote.id)}
                    >
                      {busyKey === quote.id ? "Salvando..." : "Escolher esta opção"}
                    </button>
                  </article>
                ))}
              </div>
            </div>
          )}

          {protectedTransport && (
            <p className="text-[10px] leading-4 text-muted">
              O trecho já está reservado, comprado ou confirmado. A pesquisa continua disponível para comparação, mas o Nordestrip não substitui os dados automaticamente.
            </p>
          )}

          <p className="text-[10px] leading-4 text-muted">
            A tarifa exibida é por passageiro e pode mudar até a compra. O total da viagem só deve ser registrado depois da confirmação no fornecedor.
          </p>
        </div>
      )}
    </div>
  );
}
