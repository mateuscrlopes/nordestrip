import { PageHeader } from "@/components/layout/page-header";
import { LogoutButton } from "@/components/navigation/logout-button";
import { getCurrentTrip } from "@/lib/queries/current-trip";
import { getTripMoreData, getTripPendingItems } from "@/lib/queries/trips";
import {
  ChevronRight,
  ClipboardList,
  FileText,
  Plug,
  Settings,
  Users,
} from "lucide-react";

function IntegrationSummary({
  integrations,
}: {
  integrations: Record<string, unknown>[];
}) {
  const counts = integrations.reduce<Record<string, number>>((all, integration) => {
    const status = String(integration.status);
    all[status] = (all[status] ?? 0) + 1;
    return all;
  }, {});

  if (!integrations.length) return <>Nenhuma integração cadastrada.</>;

  const parts = [
    counts.connected ? `${counts.connected} conectada${counts.connected > 1 ? "s" : ""}` : null,
    counts.configured ? `${counts.configured} configurada${counts.configured > 1 ? "s" : ""}` : null,
    counts.needs_attention ? `${counts.needs_attention} com atenção` : null,
    counts.not_configured ? `${counts.not_configured} não configurada${counts.not_configured > 1 ? "s" : ""}` : null,
    counts.disabled ? `${counts.disabled} desativada${counts.disabled > 1 ? "s" : ""}` : null,
  ].filter(Boolean);

  return <>{parts.join(" · ")}</>;
}

export default async function MorePage() {
  const { trip } = await getCurrentTrip();
  const [pending, more] = trip
    ? await Promise.all([getTripPendingItems(trip.id), getTripMoreData(trip.id)])
    : [[], { reservations: [], documents: [], members: [], integrations: [] }];

  return (
    <>
      <PageHeader title="Mais" description="Reservas, pessoas e configurações da viagem." />

      <div className="space-y-7">
        <section>
          <p className="settings-group-title">Viagem</p>
          <div className="settings-list">
            <details className="group">
              <summary>
                <span className="settings-row-icon"><FileText size={17} /></span>
                <span className="min-w-0 flex-1">
                  <strong>Reservas e documentos</strong>
                  <small>{more.reservations.length} reservas · {more.documents.length} documentos</small>
                </span>
                <ChevronRight size={17} className="settings-chevron" />
              </summary>
              <div className="settings-detail">
                {more.reservations.length || more.documents.length
                  ? "Os registros cadastrados ficam centralizados nesta área."
                  : "Nenhuma reserva ou documento registrado ainda."}
              </div>
            </details>

            <details className="group">
              <summary>
                <span className="settings-row-icon"><Users size={17} /></span>
                <span className="min-w-0 flex-1">
                  <strong>Participantes</strong>
                  <small>{more.members.length} participantes</small>
                </span>
                <ChevronRight size={17} className="settings-chevron" />
              </summary>
              <div className="settings-detail">
                Acesso compartilhado e divisão padrão da viagem.
              </div>
            </details>

            <details className="group">
              <summary>
                <span className="settings-row-icon"><ClipboardList size={17} /></span>
                <span className="min-w-0 flex-1">
                  <strong>Pendências</strong>
                  <small>{pending.length ? `${pending.length} abertas` : "Nenhuma aberta"}</small>
                </span>
                <ChevronRight size={17} className="settings-chevron" />
              </summary>
              <div className="settings-detail">
                {pending.length ? (
                  <ul className="space-y-2">
                    {pending.map((item) => <li key={item.id}>{item.title}</li>)}
                  </ul>
                ) : (
                  "Nenhuma pendência aberta."
                )}
              </div>
            </details>
          </div>
        </section>

        <section>
          <p className="settings-group-title">Sistema</p>
          <div className="settings-list">
            <details className="group">
              <summary>
                <span className="settings-row-icon"><Plug size={17} /></span>
                <span className="min-w-0 flex-1">
                  <strong>Integrações</strong>
                  <small><IntegrationSummary integrations={more.integrations} /></small>
                </span>
                <ChevronRight size={17} className="settings-chevron" />
              </summary>
              <div className="settings-detail">
                Mercado Pago, Santander, hospedagem, transporte e mapas aparecem aqui conforme forem configurados.
              </div>
            </details>

            <details className="group">
              <summary>
                <span className="settings-row-icon"><Settings size={17} /></span>
                <span className="min-w-0 flex-1">
                  <strong>Configurações</strong>
                  <small>Preferências da viagem</small>
                </span>
                <ChevronRight size={17} className="settings-chevron" />
              </summary>
              <div className="settings-detail">
                Ritmo, bagagem, orçamento, alertas e outras preferências serão organizados nesta área.
              </div>
            </details>
          </div>
        </section>

        <div className="pt-1">
          <LogoutButton />
        </div>
      </div>
    </>
  );
}
