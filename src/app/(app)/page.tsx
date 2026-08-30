import { getCurrentTrip } from "@/lib/queries/current-trip";
import { getTripCityCovers, getTripFinanceSummary, getTripPendingItems, getTripPreferences, getTripTransports } from "@/lib/queries/trips";
import { formatDate, formatDateTime, formatMoney, formatTime } from "@/lib/utils/format";
import type { CityCover } from "@/types/trip";
import {
  ArrowRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  TicketCheck,
} from "lucide-react";
import Link from "next/link";

const transportStatus: Record<string, string> = {
  idea: "Em análise",
  planned: "Planejado",
  quoted: "Cotado",
  reserved: "Reservado",
  purchased: "Comprado",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
};

function dateKeyInTimeZone(date: Date, timeZone = "America/Sao_Paulo") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const value = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function dayNumber(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function selectHeroCover(covers: CityCover[], today: string) {
  if (!covers.length) return { cover: null, isCurrentCity: false };

  const currentCity = covers
    .filter((cover) => cover.start_date && cover.end_date && today >= cover.start_date && today <= cover.end_date)
    .sort((a, b) => (a.sequence ?? 999) - (b.sequence ?? 999))[0];

  if (currentCity) return { cover: currentCity, isCurrentCity: true };

  const index = ((dayNumber(today) % covers.length) + covers.length) % covers.length;
  return { cover: covers[index], isCurrentCity: false };
}

export default async function HomePage() {
  const { trip } = await getCurrentTrip();

  if (!trip) {
    return (
      <section className="home-hero min-h-[220px] rounded-[32px] p-6">
        <div className="hero-brand-lockup">
          <span className="ghumat-mark" aria-hidden="true" />
          <span className="brand-name">Nordestrip</span>
        </div>
        <h1 className="mt-12 text-[1.8rem] font-semibold tracking-[-.04em]">Nenhuma viagem por aqui</h1>
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted">Quando você entrar em uma viagem, os próximos passos aparecerão aqui.</p>
      </section>
    );
  }

  const [pending, transports, finance, cityCovers, preferences] = await Promise.all([
    getTripPendingItems(trip.id),
    getTripTransports(trip.id),
    getTripFinanceSummary(trip.id),
    getTripCityCovers(trip.id),
    getTripPreferences(trip.id),
  ]);

  const today = dateKeyInTimeZone(new Date());
  const nextTransport = transports.find((item) =>
    item.status !== "cancelled"
    && (item.departure_at
      ? new Date(item.departure_at) >= new Date()
      : !item.departure_date || item.departure_date >= today)
  );

  const tripDates = [formatDate(trip.start_date), formatDate(trip.end_date)].filter(Boolean).join(" — ");
  const routeTitle = nextTransport
    ? [nextTransport.origin_label, nextTransport.destination_label].filter(Boolean).join(" → ")
      || nextTransport.mode
      || "Deslocamento"
    : null;
  const nextBufferMinutes = nextTransport
    ? nextTransport.mode === "flight"
      ? preferences?.airport_buffer_minutes ?? 120
      : preferences?.terminal_buffer_minutes ?? 45
    : null;
  const nextCheckpointDeadline = nextTransport?.departure_at && nextBufferMinutes != null
    ? new Date(new Date(nextTransport.departure_at).getTime() - nextBufferMinutes * 60_000).toISOString()
    : null;
  const nextCheckpointLabel = nextTransport?.mode === "flight" ? "aeroporto" : "terminal";

  const routeCovers = [...cityCovers].sort((a, b) => (a.sequence ?? 999) - (b.sequence ?? 999));
  const routeRange = routeCovers.length > 1
    ? `${routeCovers[0].city_name} → ${routeCovers[routeCovers.length - 1].city_name}`
    : trip.name;

  const { cover: heroCover, isCurrentCity } = selectHeroCover(cityCovers, today);
  const heroImage = heroCover?.image_url || trip.cover_url || null;
  const heroTitle = isCurrentCity && heroCover ? heroCover.city_name : routeRange;
  const heroHasImage = Boolean(heroImage);

  const shortcuts = [
    { href: "/roteiro", label: "Roteiro", icon: CalendarDays },
    { href: "/mais", label: "Reservas", icon: TicketCheck },
    { href: "/dinheiro", label: "Dinheiro", icon: Banknote },
    { href: "/mais", label: "Pendências", icon: ClipboardList },
  ];

  const coverStyle = heroImage
    ? {
        backgroundImage: `url("${heroImage.replace(/"/g, "%22")}")`,
      }
    : undefined;

  return (
    <div className="space-y-7">
      <section className={`home-hero overflow-hidden rounded-[32px] p-6 ${heroHasImage ? "has-cover" : ""}`} style={coverStyle}>
        <div className="relative z-10 flex min-h-[162px] flex-col">
          <div className="hero-brand-lockup">
            <span className="ghumat-mark" aria-hidden="true" />
            <span className="brand-name">Nordestrip</span>
          </div>

          <div className={`hero-caption mt-auto w-full pt-10 ${heroHasImage ? "hero-caption--image" : ""}`}>
            <p className={`text-[13px] font-medium ${heroHasImage ? "text-white/80" : "text-petrol/70"}`}>
              {tripDates || "Planejamento da viagem"}
            </p>
            <h1 className={`mt-1 text-[2rem] font-semibold leading-tight tracking-[-.045em] ${heroHasImage ? "text-white" : ""}`}>
              {heroTitle}
            </h1>
          </div>
        </div>
      </section>

      {nextTransport && (
        <section>
          <div className="section-heading">
            <h2>Próximo deslocamento</h2>
          </div>
          <div className="transport-feature">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[13px] font-medium text-white/65">
                  {nextTransport.operator || "Transporte"}
                </p>
                <h3 className="mt-2 text-[1.35rem] font-semibold leading-tight tracking-[-.035em] text-white">
                  {routeTitle}
                </h3>
              </div>
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/10 text-white">
                <ArrowRight size={19} />
              </span>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-white/80">
              {nextTransport.departure_at ? (
                <span>{formatDateTime(nextTransport.departure_at)}</span>
              ) : nextTransport.departure_date ? (
                <span>{formatDate(nextTransport.departure_date)}</span>
              ) : null}
              {nextTransport.status && (
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-medium text-white/90">
                  {transportStatus[nextTransport.status] || nextTransport.status}
                </span>
              )}
            </div>
            {nextCheckpointDeadline && (
              <p className="mt-3 text-[12px] leading-5 text-white/70">
                Estar no {nextCheckpointLabel} até {formatTime(nextCheckpointDeadline)}. O tempo para chegar até lá ainda não está incluído.
              </p>
            )}
          </div>
        </section>
      )}

      <nav aria-label="Atalhos da viagem">
        <div className="shortcut-grid">
          {shortcuts.map(({ href, label, icon: Icon }) => (
            <Link key={label} href={href} className="shortcut-item">
              <span className="shortcut-icon"><Icon size={19} strokeWidth={1.8} /></span>
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </nav>

      {pending[0] && (
        <section>
          <div className="section-heading">
            <h2>Próxima decisão</h2>
          </div>
          <Link href="/mais" className="decision-row group">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-sand/28 text-petrol">
              <CheckCircle2 size={18} strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-5">{pending[0].title}</span>
              {pending[0].due_at && (
                <span className="mt-1 block text-[12px] text-muted">Prazo: {formatDateTime(pending[0].due_at)}</span>
              )}
            </span>
            <ChevronRight size={18} className="mt-1 shrink-0 text-muted transition group-hover:translate-x-0.5" />
          </Link>
        </section>
      )}

      <section>
        <div className="section-heading">
          <h2>Dinheiro</h2>
          <Link href="/dinheiro">Ver detalhes</Link>
        </div>
        <Link href="/dinheiro" className="money-panel block">
          <p className="text-[12px] font-medium text-petrol/65">Disponível para usar</p>
          {finance?.available_to_use == null ? (
            <p className="mt-2 text-[16px] font-semibold tracking-[-.02em]">Saldo do fundo ainda não definido</p>
          ) : (
            <p className="mt-1 text-[1.7rem] font-semibold tracking-[-.045em]">
              {formatMoney(finance.available_to_use)}
            </p>
          )}

          {(finance?.future_commitments ?? 0) > 0 || (finance?.protected_reserve ?? 0) > 0 ? (
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-petrol/8 pt-4">
              {(finance?.future_commitments ?? 0) > 0 && (
                <div>
                  <p className="text-[11px] text-muted">Compromissos</p>
                  <p className="mt-1 text-sm font-semibold">{formatMoney(finance?.future_commitments)}</p>
                </div>
              )}
              {(finance?.protected_reserve ?? 0) > 0 && (
                <div>
                  <p className="text-[11px] text-muted">Reserva protegida</p>
                  <p className="mt-1 text-sm font-semibold">{formatMoney(finance?.protected_reserve)}</p>
                </div>
              )}
            </div>
          ) : null}
        </Link>
      </section>

      {pending.length > 1 && (
        <section className="pb-2">
          <div className="section-heading">
            <h2>Alertas</h2>
            <Link href="/mais">Ver todos</Link>
          </div>
          <div className="divide-y divide-petrol/8 rounded-[22px] bg-surface/72 px-5">
            {pending.slice(1, 4).map((item) => (
              <Link key={item.id} href="/mais" className="flex items-center justify-between gap-4 py-4">
                <span className="text-sm font-medium">{item.title}</span>
                <ChevronRight size={17} className="shrink-0 text-muted" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
