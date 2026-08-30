import { PluggyConnectButton } from "@/components/integrations/pluggy-connect-button";
import { formatDateTime } from "@/lib/utils/format";
import { Banknote, BedDouble, BusFront, MapPinned } from "lucide-react";
import Link from "next/link";

type IntegrationRecord = Record<string, unknown>;

const catalog = [
  {
    key: "finance",
    title: "Open Finance",
    provider: "Pluggy",
    description: "Saldo, conta e cartão usados na leitura financeira da viagem.",
    aliases: ["pluggy"],
    purposes: ["finance", "open_finance", "banking"],
    icon: Banknote,
  },
  {
    key: "accommodation",
    title: "Hospedagem",
    provider: "Scrappa / Booking",
    description: "Pesquisa e referência de hotéis, comodidades e opções salvas.",
    aliases: ["scrappa", "booking"],
    purposes: ["accommodation", "lodging", "hotel"],
    icon: BedDouble,
  },
  {
    key: "transport",
    title: "Transporte rodoviário",
    provider: "GeckoAPI / ClickBus",
    description: "Pesquisa de trechos e horários; a confirmação continua no fornecedor.",
    aliases: ["geckoapi", "clickbus", "gecko"],
    purposes: ["transport", "bus"],
    icon: BusFront,
  },
  {
    key: "routing",
    title: "Mapas e rotas",
    provider: "MapTiler + openrouteservice",
    description: "Mapa interno, circuitos e rotas reais a pé da viagem.",
    aliases: ["maptiler_openrouteservice", "maptiler", "openrouteservice", "maps", "routing"],
    purposes: ["maps_and_routes", "routing", "maps", "location"],
    icon: MapPinned,
  },
];

const statusLabel: Record<string, string> = {
  connected: "Conectada",
  configured: "Configurada",
  needs_attention: "Precisa de atenção",
  not_configured: "Não configurada",
  disabled: "Desativada",
};

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function matchConnection(item: (typeof catalog)[number], connections: IntegrationRecord[]) {
  return connections.find((connection) => {
    const provider = textValue(connection.provider).toLowerCase();
    const purpose = textValue(connection.purpose).toLowerCase();
    return item.aliases.some((alias) => provider.includes(alias))
      || item.purposes.includes(purpose);
  });
}

export function IntegrationCatalog({
  connections,
  tripId,
  accommodationStopId,
  busStopId,
}: {
  connections: IntegrationRecord[];
  tripId?: string | null;
  accommodationStopId?: string | null;
  busStopId?: string | null;
}) {
  return (
    <div className="integration-catalog">
      {catalog.map((item) => {
        const connection = matchConnection(item, connections);
        const status = textValue(connection?.status) || "not_configured";
        const Icon = item.icon;
        const lastSync = textValue(connection?.last_success_at) || textValue(connection?.last_sync_at);
        const error = status === "needs_attention" ? textValue(connection?.last_error_message) : "";

        return (
          <div key={item.key} className="integration-row">
            <span className="integration-icon"><Icon size={17} /></span>
            <div className="min-w-0 flex-1">
              <div className="integration-title-line">
                <strong>{item.title}</strong>
                <span className={`integration-status integration-status--${status}`}>
                  {statusLabel[status] || status}
                </span>
              </div>
              <small>{item.provider}</small>
              <p>{item.description}</p>
              {lastSync && <em>Última atualização {formatDateTime(lastSync)}</em>}
              {error && <em className="integration-error">{error}</em>}
              {item.key === "finance" && tripId && (
                <PluggyConnectButton
                  tripId={tripId}
                  itemId={textValue(connection?.external_connection_id) || null}
                  status={status}
                />
              )}
              {item.key === "accommodation" && accommodationStopId && (
                <Link
                  href={`/cidade/${accommodationStopId}?integration=lodging#hospedagem`}
                  className="mt-3 inline-flex min-h-9 items-center justify-center rounded-xl bg-pale-blue/55 px-3 text-[11px] font-semibold text-petrol"
                >
                  Pesquisar hospedagem
                </Link>
              )}
              {item.key === "transport" && busStopId && (
                <Link
                  href={`/cidade/${busStopId}?integration=bus#saida`}
                  className="mt-3 inline-flex min-h-9 items-center justify-center rounded-xl bg-pale-blue/55 px-3 text-[11px] font-semibold text-petrol"
                >
                  Pesquisar ônibus
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
