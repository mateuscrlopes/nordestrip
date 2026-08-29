import { RecordActions } from "@/components/actions/record-actions";
import { RestoreRecord } from "@/components/actions/restore-record";
import { PageHeader } from "@/components/layout/page-header";
import { IntegrationCatalog } from "@/components/integrations/integration-catalog";
import { RecordStatus, pendingStatusOptions, reservationStatusOptions } from "@/components/actions/record-status";
import { LogoutButton } from "@/components/navigation/logout-button";
import { PendingItemCreator } from "@/components/pending/pending-item-creator";
import { ParticipantsManager } from "@/components/participants/participants-manager";
import { TripSettingsEditor } from "@/components/settings/trip-settings-editor";
import { getCurrentTrip } from "@/lib/queries/current-trip";
import { getCurrentUser, getTripArchivedRecords, getTripChangeLog, getTripFinanceSettings, getTripMoreData, getTripParticipants, getTripPendingItems, getTripPreferences, getTripStops } from "@/lib/queries/trips";
import { formatDateTime, formatMoney } from "@/lib/utils/format";
import Link from "next/link";
import {
  ChevronRight,
  ClipboardList,
  ExternalLink,
  FileText,
  History,
  MapPinned,
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

const priorityLabel: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

const changeActionLabel: Record<string, string> = {
  create: "Adicionado",
  update: "Atualizado",
  archive: "Arquivado",
  restore: "Restaurado",
  reorder: "Rota reorganizada",
  structural_change: "Estrutura alterada",
};

export default async function MorePage() {
  const user = await getCurrentUser();
  const { trip } = await getCurrentTrip();
  const [pending, more, archived, stops, preferences, financeSettings, changes, participants] = trip && user
    ? await Promise.all([
        getTripPendingItems(trip.id),
        getTripMoreData(trip.id),
        getTripArchivedRecords(trip.id),
        getTripStops(trip.id),
        getTripPreferences(trip.id),
        getTripFinanceSettings(trip.id),
        getTripChangeLog(trip.id),
        getTripParticipants(trip.id, user.id),
      ])
    : [[], { reservations: [], documents: [], members: [], integrations: [] }, [], [], null, null, [], { currentRole: "member", members: [], invites: [] }];

  const stopById = new Map(stops.map((stop) => [stop.id, stop.city || stop.name || "Cidade"]));

  return (
    <>
      <PageHeader title="Mais" description="Reservas, pessoas e configurações da viagem." />

      <div className="space-y-7">
        <section>
          <p className="settings-group-title">Viagem</p>
          <div className="settings-list">
            <Link href="/locais" className="settings-link-row">
              <span className="settings-row-icon"><MapPinned size={17} /></span>
              <span className="min-w-0 flex-1">
                <strong>Locais</strong>
                <small>Atrações, praias, cultura e lugares para encaixar no roteiro</small>
              </span>
              <ChevronRight size={17} className="settings-chevron" />
            </Link>

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
              <div className="settings-detail settings-detail--wide">
                {trip && user ? (
                  <ParticipantsManager
                    tripId={trip.id}
                    currentUserId={user.id}
                    currentRole={participants.currentRole}
                    members={participants.members}
                    invites={participants.invites.map((invite) => ({
                      id: String(invite.id),
                      email: typeof invite.email === "string" ? invite.email : null,
                      role: typeof invite.role === "string" ? invite.role : "member",
                      status: typeof invite.status === "string" ? invite.status : "pending",
                      expires_at: typeof invite.expires_at === "string" ? invite.expires_at : null,
                      created_at: typeof invite.created_at === "string" ? invite.created_at : null,
                    }))}
                  />
                ) : (
                  "Nenhuma viagem ativa para compartilhar."
                )}
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
                {trip && (
                  <div className="mb-3">
                    <PendingItemCreator
                      tripId={trip.id}
                      stops={stops.map((stop) => ({
                        id: stop.id,
                        name: stop.city || stop.name || "Cidade",
                      }))}
                    />
                  </div>
                )}
                {pending.length ? (
                  <div className="pending-manage-list">
                    {pending.map((item) => {
                      const city = item.stop_id ? stopById.get(item.stop_id) : null;
                      const priority = item.priority || "medium";

                      return (
                        <div key={item.id} className="pending-manage-row">
                          <div className="min-w-0 flex-1">
                            <strong className="pending-manage-title">{item.title}</strong>
                            <div className="pending-meta">
                              {city && <span>{city}</span>}
                              {item.due_at && <span>Prazo {formatDateTime(item.due_at)}</span>}
                              <span className={`pending-priority pending-priority--${priority}`}>
                                {priorityLabel[priority] || priority}
                              </span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
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
                                priority,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
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
              <div className="settings-detail settings-detail--wide">
                <IntegrationCatalog connections={more.integrations} />
              </div>
            </details>

            <details className="group">
              <summary>
                <span className="settings-row-icon"><History size={17} /></span>
                <span className="min-w-0 flex-1">
                  <strong>Dados e histórico</strong>
                  <small>{archived.length ? `${archived.length} arquivado${archived.length > 1 ? "s" : ""}` : "Nenhum registro arquivado"}</small>
                </span>
                <ChevronRight size={17} className="settings-chevron" />
              </summary>
              <div className="settings-detail settings-detail--wide">
                {changes.length > 0 && (
                  <div className="change-log-block">
                    <p className="change-log-title">Alterações recentes</p>
                    <div className="change-log-list">
                      {changes.map((change) => (
                        <div key={change.id} className="change-log-row">
                          <span className="change-log-dot" aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <strong>{change.summary}</strong>
                            <small>
                              {changeActionLabel[change.action] || change.action} · {formatDateTime(change.created_at)}
                            </small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className={changes.length ? "archive-block archive-block--separated" : "archive-block"}>
                  <p className="change-log-title">Arquivados</p>
                  {archived.length ? (
                    <div className="archive-list">
                      {archived.map((item) => (
                        <div key={`${item.table}-${item.id}`} className="archive-row">
                          <div className="min-w-0 flex-1">
                            <span>{item.type}</span>
                            <strong>{item.label}</strong>
                            {item.archived_at && <small>Arquivado em {formatDateTime(item.archived_at)}</small>}
                          </div>
                          <RestoreRecord
                            table={item.table}
                            id={item.id}
                            label={item.label}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="archive-empty">Nenhum item arquivado. Itens arquivados podem ser restaurados sem perda de dados.</p>
                  )}
                </div>
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
              <div className="settings-detail settings-detail--wide">
                {trip ? (
                  <TripSettingsEditor
                    tripId={trip.id}
                    preferences={preferences}
                    finance={financeSettings}
                  />
                ) : (
                  "Nenhuma viagem ativa para configurar."
                )}
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
