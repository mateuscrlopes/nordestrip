import { PageHeader } from "@/components/layout/page-header";
import { getStopDetails } from "@/lib/queries/trips";
import { formatDateTime, valueText } from "@/lib/utils/format";
import { notFound } from "next/navigation";
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section><p className="eyebrow mb-2">{title}</p><div className="card p-5 text-sm leading-6">{children}</div></section>; }
export default async function CityPage({ params }: { params: Promise<{ stopId: string }> }) { const { stopId } = await params; let data; try { data = await getStopDetails(stopId); } catch (error) { if (error instanceof Error && error.message.includes("0 rows")) notFound(); throw error; } const { stop, accommodation, luggage, activities, pending, inbound, outbound } = data; const city = stop.city || stop.name || "Cidade"; return <><PageHeader eyebrow="Cidade" title={city}/><div className="space-y-6">
  <Panel title="Chegada">{inbound ? <><p className="font-medium">{valueText(inbound.origin) || valueText(inbound.mode) || "Transporte definido"}</p>{inbound.arrival_at && <p className="text-muted">{formatDateTime(inbound.arrival_at)}</p>}</> : <p className="text-muted">Chegada pendente.</p>}</Panel>
  <Panel title="Hospedagem">{accommodation ? <><p className="font-medium">{valueText(accommodation.name) || "Hospedagem definida"}</p>{accommodation.address && <p className="text-muted">{String(accommodation.address)}</p>}</> : <p className="text-muted">Hospedagem pendente.</p>}</Panel>
  <Panel title="Estratégia de bagagem">{luggage ? <p>{valueText(luggage.notes) || valueText(luggage.strategy) || "Estratégia registrada."}</p> : <p className="text-muted">Estratégia de bagagem pendente.</p>}</Panel>
  <Panel title="Atividades">{activities.length ? <ul className="space-y-2">{activities.map((item) => <li key={String(item.id)}>{String(item.title ?? item.name ?? "Atividade")}</li>)}</ul> : <p className="text-muted">Nenhuma atividade adicionada.</p>}</Panel>
  <Panel title="Pendências">{pending.length ? <ul className="space-y-2">{pending.map((item) => <li key={String(item.id)}>{String(item.title)}</li>)}</ul> : <p className="text-muted">Nenhuma pendência aberta.</p>}</Panel>
  <Panel title="Saída">{outbound ? <><p className="font-medium">{valueText(outbound.destination) || valueText(outbound.mode) || "Transporte definido"}</p>{outbound.departure_at && <p className="text-muted">{formatDateTime(outbound.departure_at)}</p>}</> : <p className="text-muted">Saída pendente.</p>}</Panel>
  </div></>; }
