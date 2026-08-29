import { RecordActions } from "@/components/actions/record-actions";
import { PageHeader } from "@/components/layout/page-header";
import { RecordStatus, pendingStatusOptions, reservationStatusOptions } from "@/components/actions/record-status";
import { LogoutButton } from "@/components/navigation/logout-button";
import { getCurrentTrip } from "@/lib/queries/current-trip";
import { getTripMoreData, getTripPendingItems } from "@/lib/queries/trips";
import { formatMoney } from "@/lib/utils/format";
import {
  ChevronRight,
  ClipboardList,
  ExternalLink,
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
                {more.reservations.length > 0 && (
                  <div className="settings-subsection">
                    <p>Reservas</p>
                    {more.reservations.map((reservation) => (
                      <div key={String(reservation.id)} className="settings-record">
                        <div>
                          <strong>{String(reservation.title)}</strong>
                          <small>
                            {reservation.supplier ? String(reservation.supplier) : "Sem fornecedor"}
                          </small>
                          <div className="mt-2">
                            <RecordStatus
                              table="reservations"
                              id={String(reservation.id)}
                              value={String(reservation.status || "estimated")}
                              options={reservationStatusOptions}
                              label={`Status de ${String(reservation.title)}`}
                              compact
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {typeof reservation.total_amount === "number" && (
                            <b>{formatMoney(reservation.total_amount)}</b>
                          )}
                          {reservation.source_url && (
                            <a href={String(reservation.source_url)} target="_blank" rel="noreferrer" aria-label="Abrir reserva">
                              <ExternalLink size={15} />
                            </a>
                          )}
                          <RecordActions
                            table="reservations"
                            id={String(reservation.id)}
                            title={String(reservation.title)}
                            fields={[
                              { name: "title", label: "Reserva", required: true },
                              { name: "supplier", label: "Fornecedor" },
                              { name: "confirmation_code", label: "Localizador" },
                              { name: "total_amount", label: "Valor total", type: "number", min: "0", step: "0.01" },
                              { name: "paid_amount", label: "Valor pago", type: "number", min: "0", step: "0.01" },
                              { name: "payment_due_at", label: "Próximo pagamento", type: "datetime-local" },
                              { name: "source_url", label: "Link", type: "url" },
                              { name: "notes", label: "Nota", type: "textarea" },
                            ]}
                            values={{
                              title: reservation.title ?? "",
                              supplier: reservation.supplier ?? null,
                              confirmation_code: reservation.confirmation_code ?? null,
                              total_amount: reservation.total_amount ?? null,
                              paid_amount: reservation.paid_amount ?? 0,
                              payment_due_at: reservation.payment_due_at ?? null,
                              source_url: reservation.source_url ?? null,
                              notes: reservation.notes ?? null,
                            }}
                            archiveWarning={
                              ["purchased", "paid"].includes(String(reservation.status))
                                ? "Esta reserva já foi comprada ou paga."
                                : undefined
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {more.documents.length > 0 && (
                  <div className="settings-subsection">
                    <p>Documentos</p>
                    {more.documents.map((document) => (
                      <div key={String(document.id)} className="settings-record">
                        <div>
                          <strong>{String(document.title)}</strong>
                          <small>{String(document.document_type || "other")}</small>
                        </div>
                        <div className="flex items-center gap-2">
                          {document.external_url && (
                            <a href={String(document.external_url)} target="_blank" rel="noreferrer" aria-label="Abrir documento">
                              <ExternalLink size={15} />
                            </a>
                          )}
                          <RecordActions
                            table="documents"
                            id={String(document.id)}
                            title={String(document.title)}
                            fields={[
                              { name: "title", label: "Título", required: true },
                              { name: "external_url", label: "Link", type: "url" },
                              { name: "is_essential", label: "Documento essencial", type: "checkbox" },
                              { name: "notes", label: "Nota", type: "textarea" },
                            ]}
                            values={{
                              title: document.title ?? "",
                              external_url: document.external_url ?? null,
                              is_essential: Boolean(document.is_essential),
                              notes: document.notes ?? null,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!more.reservations.length && !more.documents.length && "Nenhuma reserva ou documento registrado ainda."}
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
                  <div className="pending-manage-list">
                    {pending.map((item) => (
                      <div key={item.id} className="pending-manage-row">
                        <span>{item.title}</span>
                        <div className="flex items-center gap-2">
                          <RecordStatus
                            table="pending_items"
                            id={item.id}
                            value={item.status}
                            options={pendingStatusOptions}
                            label={`Status de ${item.title}`}
                            compact
                          />
                          <RecordActions
                            table="pending_items"
                            id={item.id}
                            title={item.title}
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
                              title: item.title,
                              description: item.description ?? null,
                              due_at: item.due_at ?? null,
                              priority: item.priority ?? "medium",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
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
