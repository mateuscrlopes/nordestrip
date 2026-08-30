"use client";

import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  BedDouble,
  CalendarPlus,
  FilePlus2,
  MapPinPlus,
  Plus,
  ReceiptText,
  TicketCheck,
  TrainFront,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

type StopOption = {
  id: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
};

type AddKind =
  | "place"
  | "activity"
  | "transport"
  | "accommodation"
  | "expense"
  | "reservation"
  | "document";

const options: { kind: AddKind; label: string; description: string; icon: typeof MapPinPlus }[] = [
  { kind: "place", label: "Descobri algo", description: "Guardar um lugar ou link para olhar depois", icon: MapPinPlus },
  { kind: "activity", label: "Atividade", description: "Adicionar algo ao roteiro", icon: CalendarPlus },
  { kind: "transport", label: "Transporte", description: "Registrar um deslocamento", icon: TrainFront },
  { kind: "accommodation", label: "Hospedagem", description: "Salvar uma opção ou reserva", icon: BedDouble },
  { kind: "expense", label: "Gasto", description: "Registrar um gasto da viagem", icon: ReceiptText },
  { kind: "reservation", label: "Reserva", description: "Centralizar uma reserva ou compra", icon: TicketCheck },
  { kind: "document", label: "Nota ou documento", description: "Guardar link, comprovante ou referência", icon: FilePlus2 },
];

function value(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

function nullable(form: FormData, name: string) {
  const result = value(form, name);
  return result || null;
}

function numberOrNull(form: FormData, name: string) {
  const raw = value(form, name).replace(",", ".");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function findStopByLabel(stops: StopOption[], label: string | null) {
  if (!label) return undefined;
  const normalized = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");

  return stops.find((stop) =>
    stop.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLocaleLowerCase("pt-BR") === normalized
  );
}

function CityField({
  stops,
  name = "stop_id",
  label = "Cidade",
  defaultStopId,
  required = false,
}: {
  stops: StopOption[];
  name?: string;
  label?: string;
  defaultStopId?: string | null;
  required?: boolean;
}) {
  return (
    <label className="add-field">
      <span>{label}</span>
      <select name={name} defaultValue={defaultStopId || ""} required={required}>
        <option value="">{required ? "Selecione" : "Sem cidade específica"}</option>
        {stops.map((stop) => (
          <option key={stop.id} value={stop.id}>{stop.name}</option>
        ))}
      </select>
    </label>
  );
}

export function GlobalAdd({
  tripId,
  userId,
  stops,
}: {
  tripId: string | null;
  userId: string;
  stops: StopOption[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AddKind | null>(null);
  const [scheduleType, setScheduleType] = useState("none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const contextualStopId = useMemo(() => {
    const match = pathname.match(/^\/cidade\/([^/]+)/);
    return match?.[1] && stops.some((stop) => stop.id === match[1]) ? match[1] : null;
  }, [pathname, stops]);

  const activeOption = options.find((option) => option.kind === kind);

  function close() {
    setOpen(false);
    setKind(null);
    setScheduleType("none");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tripId || !kind) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const supabase = createClient();
    setSaving(true);
    setError("");

    let table = "";
    let payload: Record<string, unknown> = { trip_id: tripId };

    if (kind === "place") {
      table = "places";
      payload = {
        ...payload,
        stop_id: nullable(form, "stop_id"),
        name: value(form, "name"),
        category: nullable(form, "category"),
        source: "manual",
        address: nullable(form, "address"),
        source_url: nullable(form, "source_url"),
        notes: nullable(form, "notes"),
      };
    }

    if (kind === "activity") {
      table = "itinerary_items";
      const type = value(form, "schedule_type") || "none";
      payload = {
        ...payload,
        stop_id: nullable(form, "stop_id"),
        title: value(form, "title"),
        item_type: value(form, "item_type") || "activity",
        activity_date: nullable(form, "activity_date"),
        schedule_type: type,
        period: type === "period" ? nullable(form, "period") : null,
        start_time: ["window", "from", "exact"].includes(type) ? nullable(form, "start_time") : null,
        end_time: ["window", "until"].includes(type) ? nullable(form, "end_time") : null,
        priority: nullable(form, "priority"),
        status: value(form, "status") || "planned",
        is_anchor: type === "exact",
        notes: nullable(form, "notes"),
      };
    }

    if (kind === "transport") {
      table = "transport_segments";
      const originLabel = nullable(form, "origin_label");
      const destinationLabel = nullable(form, "destination_label");
      const originStop = findStopByLabel(stops, originLabel);
      const destinationStop = findStopByLabel(stops, destinationLabel);
      const departureAtRaw = nullable(form, "departure_at");
      const arrivalAtRaw = nullable(form, "arrival_at");
      const departureAt = departureAtRaw ? new Date(departureAtRaw) : null;
      const arrivalAt = arrivalAtRaw ? new Date(arrivalAtRaw) : null;

      if (departureAt && arrivalAt && arrivalAt.getTime() < departureAt.getTime()) {
        setError("A chegada não pode ser anterior à saída.");
        setSaving(false);
        return;
      }

      payload = {
        ...payload,
        origin_stop_id: originStop?.id ?? null,
        destination_stop_id: destinationStop?.id ?? null,
        origin_label: originLabel,
        destination_label: destinationLabel,
        mode: value(form, "mode") || "other",
        status: value(form, "status") || "planned",
        departure_date: departureAtRaw?.slice(0, 10) || null,
        arrival_date: arrivalAtRaw?.slice(0, 10) || null,
        departure_at: departureAt ? departureAt.toISOString() : null,
        arrival_at: arrivalAt ? arrivalAt.toISOString() : null,
        origin_terminal_name: nullable(form, "origin_terminal_name"),
        destination_terminal_name: nullable(form, "destination_terminal_name"),
        operator: nullable(form, "operator"),
        booking_reference: nullable(form, "booking_reference"),
        amount: numberOrNull(form, "amount"),
        source: "manual",
        notes: nullable(form, "notes"),
      };
    }

    if (kind === "accommodation") {
      table = "__accommodation_rpc__";
      const checkInDate = nullable(form, "check_in_date");
      const checkOutDate = nullable(form, "check_out_date");

      if (checkInDate && checkOutDate && checkOutDate < checkInDate) {
        setError("O check-out não pode ser anterior ao check-in.");
        setSaving(false);
        return;
      }

      payload = {
        p_trip_id: tripId,
        p_stop_id: value(form, "stop_id"),
        p_name: value(form, "name"),
        p_accommodation_type: nullable(form, "accommodation_type"),
        p_status: value(form, "status") || "researching",
        p_address: nullable(form, "address"),
        p_check_in_date: checkInDate,
        p_check_out_date: checkOutDate,
        p_check_in_from: nullable(form, "check_in_from"),
        p_check_out_until: nullable(form, "check_out_until"),
        p_source_url: nullable(form, "source_url"),
        p_notes: nullable(form, "notes"),
      };
    }

    if (kind === "expense") {
      table = "expenses";
      const occurredAt = nullable(form, "occurred_at");
      payload = {
        ...payload,
        stop_id: nullable(form, "stop_id"),
        title: value(form, "title"),
        amount: numberOrNull(form, "amount"),
        payer_user_id: userId,
        payment_method: nullable(form, "payment_method"),
        status: "posted",
        source: "manual",
        notes: nullable(form, "notes"),
        ...(occurredAt ? { occurred_at: new Date(occurredAt).toISOString() } : {}),
      };
    }

    if (kind === "reservation") {
      table = "reservations";
      const totalAmount = numberOrNull(form, "total_amount");
      const paidAmount = numberOrNull(form, "paid_amount") ?? 0;
      if (totalAmount != null && paidAmount > totalAmount) {
        setError("O valor pago não pode ser maior que o valor total.");
        setSaving(false);
        return;
      }
      payload = {
        ...payload,
        stop_id: nullable(form, "stop_id"),
        title: value(form, "title"),
        reservation_type: value(form, "reservation_type") || "other",
        status: value(form, "status") || "estimated",
        supplier: nullable(form, "supplier"),
        confirmation_code: nullable(form, "confirmation_code"),
        total_amount: totalAmount,
        paid_amount: paidAmount,
        payment_method: nullable(form, "payment_method"),
        source_url: nullable(form, "source_url"),
        notes: nullable(form, "notes"),
      };
    }

    if (kind === "document") {
      table = "documents";
      payload = {
        ...payload,
        stop_id: nullable(form, "stop_id"),
        title: value(form, "title"),
        document_type: value(form, "document_type") || "other",
        external_url: nullable(form, "external_url"),
        is_essential: form.get("is_essential") === "on",
        notes: nullable(form, "notes"),
      };
    }

    const { error: insertError } = table === "__accommodation_rpc__"
      ? await supabase.rpc("create_accommodation_with_place", payload)
      : await supabase.from(table).insert(payload);

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    formElement.reset();
    setSaving(false);
    close();
    setNotice("Adicionado");
    router.refresh();
    window.setTimeout(() => setNotice(""), 1800);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Adicionar"
        className="grid size-[44px] place-items-center rounded-[17px] bg-petrol text-white shadow-[0_6px_16px_rgba(18,56,68,.16)] transition hover:bg-[#0d303a] active:scale-[.97]"
      >
        <Plus size={20} />
      </button>

      {notice && <div className="add-toast" role="status">{notice}</div>}

      {open && (
        <div className="add-overlay" onClick={close}>
          <section className="add-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="add-sheet-header">
              <div className="flex items-center gap-2">
                {kind && (
                  <button type="button" aria-label="Voltar" onClick={() => { setKind(null); setError(""); }} className="add-icon-button">
                    <ArrowLeft size={19} />
                  </button>
                )}
                <div>
                  <h2>{activeOption?.label || "Adicionar"}</h2>
                  {activeOption && <p>{activeOption.description}</p>}
                </div>
              </div>
              <button type="button" aria-label="Fechar" onClick={close} className="add-icon-button">
                <X size={20} />
              </button>
            </div>

            {!tripId ? (
              <div className="empty-surface mt-3">
                <p>Nenhuma viagem ativa para receber este registro.</p>
              </div>
            ) : !kind ? (
              <div className="add-option-list">
                {options.map(({ kind: optionKind, label, description, icon: Icon }) => (
                  <button key={optionKind} type="button" onClick={() => setKind(optionKind)} className="add-option">
                    <span><Icon size={18} /></span>
                    <div>
                      <strong>{label}</strong>
                      <small>{description}</small>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <form onSubmit={submit} className="add-form">
                {kind === "place" && (
                  <>
                    <label className="add-field"><span>Nome</span><input name="name" required placeholder="Ex.: restaurante, praia, passeio" /></label>
                    <CityField stops={stops} defaultStopId={contextualStopId} />
                    <label className="add-field"><span>Categoria</span><input name="category" placeholder="Ex.: restaurante, atração, logística" /></label>
                    <label className="add-field"><span>Endereço</span><input name="address" placeholder="Rua, bairro ou referência" /></label>
                    <label className="add-field"><span>Link</span><input name="source_url" type="url" inputMode="url" placeholder="Instagram, Maps, site..." /></label>
                    <label className="add-field"><span>Nota</span><textarea name="notes" rows={3} placeholder="Por que vale olhar depois?" /></label>
                  </>
                )}

                {kind === "activity" && (
                  <>
                    <label className="add-field"><span>Atividade</span><input name="title" required placeholder="O que vocês querem fazer?" /></label>
                    <div className="add-grid">
                      <CityField stops={stops} defaultStopId={contextualStopId} />
                      <label className="add-field"><span>Data</span><input name="activity_date" type="date" /></label>
                    </div>
                    <div className="add-grid">
                      <label className="add-field">
                        <span>Tipo</span>
                        <select name="item_type" defaultValue="activity">
                          <option value="activity">Atividade</option>
                          <option value="meal">Refeição</option>
                          <option value="logistics">Logística</option>
                          <option value="note">Nota</option>
                        </select>
                      </label>
                      <label className="add-field">
                        <span>Prioridade</span>
                        <select name="priority" defaultValue="medium">
                          <option value="high">Quero muito</option>
                          <option value="medium">Seria legal</option>
                          <option value="low">Se der</option>
                        </select>
                      </label>
                    </div>
                    <label className="add-field">
                      <span>Horário</span>
                      <select name="schedule_type" value={scheduleType} onChange={(event) => setScheduleType(event.target.value)}>
                        <option value="none">Sem horário</option>
                        <option value="period">Período</option>
                        <option value="window">Janela</option>
                        <option value="from">A partir de</option>
                        <option value="until">Até</option>
                        <option value="exact">Exato</option>
                      </select>
                    </label>
                    {scheduleType === "period" && (
                      <label className="add-field"><span>Período</span><select name="period" required defaultValue="morning"><option value="morning">Manhã</option><option value="afternoon">Tarde</option><option value="evening">Noite</option></select></label>
                    )}
                    {["window", "from", "exact"].includes(scheduleType) && (
                      <label className="add-field"><span>{scheduleType === "exact" ? "Horário exato" : "Início"}</span><input name="start_time" type="time" required /></label>
                    )}
                    {["window", "until"].includes(scheduleType) && (
                      <label className="add-field"><span>Fim</span><input name="end_time" type="time" required /></label>
                    )}
                    <label className="add-field">
                      <span>Status</span>
                      <select name="status" defaultValue="planned">
                        <option value="idea">Ideia</option>
                        <option value="planned">Planejado</option>
                        <option value="confirmed">Confirmado</option>
                      </select>
                    </label>
                    <label className="add-field"><span>Nota</span><textarea name="notes" rows={3} /></label>
                  </>
                )}

                {kind === "transport" && (
                  <>
                    <datalist id="transport-stop-options">
                      {stops.map((stop) => <option key={stop.id} value={stop.name} />)}
                    </datalist>

                    <div className="add-grid">
                      <label className="add-field">
                        <span>Origem</span>
                        <input
                          name="origin_label"
                          list="transport-stop-options"
                          required
                          defaultValue={contextualStopId ? stops.find((stop) => stop.id === contextualStopId)?.name || "" : ""}
                          placeholder="Cidade ou local de saída"
                        />
                      </label>
                      <label className="add-field">
                        <span>Destino</span>
                        <input
                          name="destination_label"
                          list="transport-stop-options"
                          required
                          placeholder="Cidade ou local de chegada"
                        />
                      </label>
                    </div>

                    <div className="add-grid">
                      <label className="add-field">
                        <span>Tipo</span>
                        <select name="mode" defaultValue="bus">
                          <option value="flight">Voo</option>
                          <option value="bus">Ônibus</option>
                          <option value="car_rental">Carro alugado</option>
                          <option value="transfer">Transfer</option>
                          <option value="train">Trem</option>
                          <option value="ferry">Balsa</option>
                          <option value="other">Outro</option>
                        </select>
                      </label>
                      <label className="add-field">
                        <span>Status</span>
                        <select name="status" defaultValue="planned">
                          <option value="planned">Pendente</option>
                          <option value="purchased">Comprado</option>
                        </select>
                      </label>
                    </div>

                    <div className="add-grid">
                      <label className="add-field"><span>Saída</span><input name="departure_at" type="datetime-local" /></label>
                      <label className="add-field"><span>Chegada</span><input name="arrival_at" type="datetime-local" /></label>
                    </div>

                    <label className="add-field"><span>Empresa</span><input name="operator" placeholder="Ex.: LATAM, Guanabara" /></label>

                    <div className="add-grid">
                      <label className="add-field"><span>Terminal de saída</span><input name="origin_terminal_name" placeholder="Aeroporto, rodoviária..." /></label>
                      <label className="add-field"><span>Terminal de chegada</span><input name="destination_terminal_name" placeholder="Aeroporto, rodoviária..." /></label>
                    </div>

                    <div className="add-grid">
                      <label className="add-field"><span>Localizador</span><input name="booking_reference" /></label>
                      <label className="add-field"><span>Valor</span><input name="amount" inputMode="decimal" placeholder="0,00" /></label>
                    </div>

                    <label className="add-field"><span>Observações</span><textarea name="notes" rows={3} /></label>
                  </>
                )}

                {kind === "accommodation" && (
                  <>
                    <CityField stops={stops} required defaultStopId={contextualStopId} />
                    <label className="add-field"><span>Hospedagem</span><input name="name" required placeholder="Nome do hotel, Airbnb ou opção" /></label>
                    <div className="add-grid">
                      <label className="add-field">
                        <span>Tipo</span>
                        <select name="accommodation_type" defaultValue="hotel">
                          <option value="hotel">Hotel</option>
                          <option value="hostel">Hostel</option>
                          <option value="airbnb">Airbnb</option>
                          <option value="apartment">Apartamento</option>
                          <option value="guesthouse">Pousada</option>
                          <option value="other">Outro</option>
                        </select>
                      </label>
                      <label className="add-field">
                        <span>Status</span>
                        <select name="status" defaultValue="researching">
                          <option value="researching">Pesquisando</option>
                          <option value="option">Opção</option>
                          <option value="selected">Selecionado</option>
                          <option value="reserved">Reservado</option>
                          <option value="confirmed">Confirmado</option>
                        </select>
                      </label>
                    </div>
                    <label className="add-field"><span>Endereço</span><input name="address" placeholder="Rua, número, bairro ou referência" /></label>
                    <div className="add-grid">
                      <label className="add-field"><span>Check-in</span><input name="check_in_date" type="date" /></label>
                      <label className="add-field"><span>Check-out</span><input name="check_out_date" type="date" /></label>
                    </div>
                    <div className="add-grid">
                      <label className="add-field"><span>Check-in a partir de</span><input name="check_in_from" type="time" /></label>
                      <label className="add-field"><span>Check-out até</span><input name="check_out_until" type="time" /></label>
                    </div>
                    <label className="add-field"><span>Link</span><input name="source_url" type="url" inputMode="url" placeholder="Booking, Airbnb, site..." /></label>
                    <label className="add-field"><span>Nota</span><textarea name="notes" rows={3} /></label>
                  </>
                )}

                {kind === "expense" && (
                  <>
                    <label className="add-field"><span>Descrição</span><input name="title" required placeholder="Ex.: almoço, Uber, passeio" /></label>
                    <div className="add-grid">
                      <label className="add-field"><span>Valor</span><input name="amount" required inputMode="decimal" placeholder="0,00" /></label>
                      <CityField stops={stops} defaultStopId={contextualStopId} />
                    </div>
                    <div className="add-grid">
                      <label className="add-field">
                        <span>Pagamento</span>
                        <select name="payment_method" defaultValue="trip_fund">
                          <option value="trip_fund">Fundo da viagem</option>
                          <option value="credit_card">Cartão de crédito</option>
                          <option value="debit_card">Cartão de débito</option>
                          <option value="pix">Pix</option>
                          <option value="cash">Dinheiro</option>
                          <option value="personal_account">Conta pessoal</option>
                          <option value="other">Outro</option>
                        </select>
                      </label>
                      <label className="add-field"><span>Quando</span><input name="occurred_at" type="datetime-local" /></label>
                    </div>
                    <label className="add-field"><span>Nota</span><textarea name="notes" rows={3} /></label>
                  </>
                )}

                {kind === "reservation" && (
                  <>
                    <label className="add-field"><span>Reserva</span><input name="title" required placeholder="O que foi reservado?" /></label>
                    <CityField stops={stops} defaultStopId={contextualStopId} />
                    <div className="add-grid">
                      <label className="add-field">
                        <span>Tipo</span>
                        <select name="reservation_type" defaultValue="other">
                          <option value="accommodation">Hospedagem</option>
                          <option value="transport">Transporte</option>
                          <option value="tour">Passeio</option>
                          <option value="restaurant">Restaurante</option>
                          <option value="rental_car">Carro alugado</option>
                          <option value="ticket">Ingresso</option>
                          <option value="other">Outro</option>
                        </select>
                      </label>
                      <label className="add-field">
                        <span>Status</span>
                        <select name="status" defaultValue="estimated">
                          <option value="estimated">Estimado</option>
                          <option value="quoted">Cotado</option>
                          <option value="reserved">Reservado</option>
                          <option value="purchased">Comprado</option>
                          <option value="paid">Pago</option>
                        </select>
                      </label>
                    </div>
                    <label className="add-field"><span>Fornecedor</span><input name="supplier" placeholder="Ex.: Booking, ClickBus" /></label>
                    <div className="add-grid">
                      <label className="add-field"><span>Valor total</span><input name="total_amount" inputMode="decimal" placeholder="0,00" /></label>
                      <label className="add-field"><span>Já pago</span><input name="paid_amount" inputMode="decimal" placeholder="0,00" /></label>
                    </div>
                    <label className="add-field"><span>Localizador</span><input name="confirmation_code" /></label>
                    <label className="add-field"><span>Link</span><input name="source_url" type="url" inputMode="url" /></label>
                    <label className="add-field"><span>Nota</span><textarea name="notes" rows={3} /></label>
                  </>
                )}

                {kind === "document" && (
                  <>
                    <label className="add-field"><span>Título</span><input name="title" required placeholder="Ex.: voucher do hotel" /></label>
                    <CityField stops={stops} defaultStopId={contextualStopId} />
                    <label className="add-field">
                      <span>Tipo</span>
                      <select name="document_type" defaultValue="other">
                        <option value="ticket">Passagem ou ingresso</option>
                        <option value="voucher">Voucher</option>
                        <option value="booking">Reserva</option>
                        <option value="receipt">Comprovante</option>
                        <option value="personal">Documento pessoal</option>
                        <option value="insurance">Seguro</option>
                        <option value="other">Outro</option>
                      </select>
                    </label>
                    <label className="add-field"><span>Link</span><input name="external_url" type="url" inputMode="url" placeholder="Link do arquivo ou página" /></label>
                    <label className="add-check"><input name="is_essential" type="checkbox" /><span>Documento essencial para a viagem</span></label>
                    <label className="add-field"><span>Nota</span><textarea name="notes" rows={3} /></label>
                  </>
                )}

                {error && <p className="add-error" role="alert">{error}</p>}

                <div className="add-form-actions">
                  <button type="button" onClick={() => setKind(null)} className="add-secondary">Cancelar</button>
                  <button type="submit" disabled={saving} className="add-primary">
                    {saving ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
