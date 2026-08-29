import { PageHeader } from "@/components/layout/page-header";
import { getCurrentTrip } from "@/lib/queries/current-trip";
import { getTripFinanceSummary, getTripPendingItems, getTripTransports } from "@/lib/queries/trips";
import { formatDateTime, formatMoney } from "@/lib/utils/format";
import Link from "next/link";

export default async function HomePage() {
  const { trip, trips } = await getCurrentTrip();
  if (!trip) return <><PageHeader eyebrow="Nordest Trip" title="Nenhuma viagem por aqui" description="Quando você entrar em uma viagem, os próximos passos aparecerão aqui."/></>;
  const [pending, transports, finance] = await Promise.all([getTripPendingItems(trip.id), getTripTransports(trip.id), getTripFinanceSummary(trip.id)]);
  const nextTransport = transports.find((item) => !item.departure_at || new Date(item.departure_at) >= new Date());
  return <><PageHeader eyebrow={trips.length > 1 ? "Viagem atual" : "Sua viagem"} title={trip.name}/><div className="space-y-7">
    {pending[0] && <section><p className="eyebrow mb-2">Próxima decisão</p><Link href="/mais" className="card block p-5"><h2 className="text-lg font-semibold">{pending[0].title}</h2>{pending[0].due_date && <p className="mt-2 text-sm text-muted">Prazo: {formatDateTime(pending[0].due_date)}</p>}</Link></section>}
    <section><p className="eyebrow mb-2">Dinheiro</p><Link href="/dinheiro" className="card block p-5"><p className="text-sm text-muted">Disponível para usar</p>{finance?.available_to_use == null ? <p className="mt-2 font-medium">Fundo da viagem ainda não conectado</p> : <p className="mt-1 text-2xl font-semibold tracking-tight">{formatMoney(finance.available_to_use)}</p>}</Link></section>
    {nextTransport && <section><p className="eyebrow mb-2">Próximo deslocamento</p><div className="card p-5"><h2 className="text-lg font-semibold">{[nextTransport.origin, nextTransport.destination].filter(Boolean).join(" para ") || nextTransport.mode || "Transporte"}</h2>{nextTransport.departure_at && <p className="mt-2 text-sm text-muted">Saída em {formatDateTime(nextTransport.departure_at)}</p>}</div></section>}
    {pending.length > 1 && <section><div className="mb-2 flex justify-between"><p className="eyebrow">Alertas</p><Link href="/mais" className="text-xs font-semibold text-petrol">Ver pendências</Link></div><div className="card divide-y divide-petrol/5 px-5">{pending.slice(1,4).map((item) => <p key={item.id} className="py-4 text-sm font-medium">{item.title}</p>)}</div></section>}
  </div></>;
}
