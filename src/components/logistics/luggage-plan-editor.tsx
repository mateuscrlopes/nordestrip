"use client";

import { createClient } from "@/lib/supabase/client";
import { Check, Copy, Pencil, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type LuggagePlan = {
  id?: string;
  phase: "arrival" | "departure";
  strategy?: string | null;
  status?: string | null;
  available_from?: string | null;
  available_until?: string | null;
  confirmation_source?: string | null;
  confirmation_note?: string | null;
  confirmed_at?: string | null;
  notes?: string | null;
};

const strategyLabels: Record<string, string> = {
  pending: "Estratégia pendente",
  accommodation: "Deixar na hospedagem",
  terminal_storage: "Guarda-volumes no terminal",
  vehicle: "Ficar no veículo",
  not_needed: "Não será necessário",
  other: "Outra estratégia",
};

const statusLabels: Record<string, string> = {
  unknown: "Ainda não confirmado",
  pending: "Precisa confirmar",
  confirmed: "Confirmado",
  unavailable: "Indisponível",
  not_needed: "Não necessário",
};

function timeValue(value?: string | null) {
  return value ? value.slice(0, 5) : "";
}

export function LuggagePlanEditor({
  tripId,
  stopId,
  phase,
  plan,
}: {
  tripId: string;
  stopId: string;
  phase: "arrival" | "departure";
  plan: LuggagePlan | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const title = phase === "arrival" ? "Na chegada" : "Na saída";
  const status = plan?.status || "unknown";
  const strategy = plan?.strategy || "pending";

  const summary = useMemo(() => {
    if (plan?.notes) return plan.notes;
    if (strategy === "pending") return "Definir onde as malas ficarão.";
    return strategyLabels[strategy] || "Estratégia registrada";
  }, [plan?.notes, strategy]);

  const confirmationMessage = phase === "arrival"
    ? "Olá! Tenho uma reserva com vocês e gostaria de confirmar se é possível deixar as bagagens na hospedagem antes do horário de check-in. Se sim, a partir de que horário posso deixá-las?"
    : "Olá! Tenho uma reserva com vocês e gostaria de confirmar se é possível deixar as bagagens na hospedagem após o check-out, até o horário em que eu seguir para o próximo destino. Até que horário vocês conseguem guardá-las?";

  async function copyConfirmationMessage() {
    try {
      await navigator.clipboard.writeText(confirmationMessage);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Não foi possível copiar a mensagem automaticamente.");
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextStatus = String(form.get("status") || "unknown");
    const payload = {
      trip_id: tripId,
      stop_id: stopId,
      phase,
      strategy: String(form.get("strategy") || "pending"),
      status: nextStatus,
      available_from: String(form.get("available_from") || "").trim() || null,
      available_until: String(form.get("available_until") || "").trim() || null,
      confirmation_source: String(form.get("confirmation_source") || "").trim() || null,
      confirmation_note: String(form.get("confirmation_note") || "").trim() || null,
      notes: String(form.get("notes") || "").trim() || null,
      confirmed_at: nextStatus === "confirmed"
        ? plan?.confirmed_at || new Date().toISOString()
        : null,
      archived_at: null,
    };

    setSaving(true);
    setError("");
    const supabase = createClient();

    const result = plan?.id
      ? await supabase.from("luggage_plans").update(payload).eq("id", plan.id)
      : await supabase.from("luggage_plans").insert(payload);

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  return (
    <>
      <div className="luggage-item luggage-item--actionable">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p>{title}</p>
            <span className={`luggage-status luggage-status--${status}`}>
              {statusLabels[status] || status}
            </span>
          </div>
          <span>{summary}</span>
          {(plan?.available_from || plan?.available_until) && (
            <small>
              {plan.available_from ? `A partir de ${timeValue(plan.available_from)}` : ""}
              {plan.available_from && plan.available_until ? " · " : ""}
              {plan.available_until ? `Até ${timeValue(plan.available_until)}` : ""}
            </small>
          )}
        </div>
        <button type="button" className="luggage-edit-button" onClick={() => setEditing(true)} aria-label={`Editar bagagem ${title.toLowerCase()}`}>
          <Pencil size={16} />
        </button>
      </div>

      {editing && (
        <div className="edit-overlay" onClick={() => setEditing(false)}>
          <section className="edit-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="edit-sheet-header">
              <div>
                <p>Bagagem</p>
                <h2>{title}</h2>
              </div>
              <button type="button" className="add-icon-button" aria-label="Fechar" onClick={() => setEditing(false)}>
                <X size={19} />
              </button>
            </div>

            <form onSubmit={save} className="add-form">
              <button
                type="button"
                className="copy-confirmation-button"
                onClick={copyConfirmationMessage}
              >
                <Copy size={15} />
                {copied ? "Mensagem copiada" : "Copiar mensagem para a hospedagem"}
              </button>

              <label className="add-field">
                <span>Estratégia</span>
                <select name="strategy" defaultValue={strategy}>
                  <option value="pending">Ainda não definida</option>
                  <option value="accommodation">Deixar na hospedagem</option>
                  <option value="terminal_storage">Guarda-volumes no terminal</option>
                  <option value="vehicle">Ficar no veículo</option>
                  <option value="not_needed">Não será necessário</option>
                  <option value="other">Outra estratégia</option>
                </select>
              </label>

              <label className="add-field">
                <span>Confirmação</span>
                <select name="status" defaultValue={status}>
                  <option value="unknown">Ainda não confirmado</option>
                  <option value="pending">Precisa confirmar</option>
                  <option value="confirmed">Confirmado</option>
                  <option value="unavailable">Indisponível</option>
                  <option value="not_needed">Não necessário</option>
                </select>
              </label>

              <div className="add-grid">
                <label className="add-field">
                  <span>Disponível a partir de</span>
                  <input name="available_from" type="time" defaultValue={timeValue(plan?.available_from)} />
                </label>
                <label className="add-field">
                  <span>Disponível até</span>
                  <input name="available_until" type="time" defaultValue={timeValue(plan?.available_until)} />
                </label>
              </div>

              <label className="add-field">
                <span>Fonte da confirmação</span>
                <input name="confirmation_source" defaultValue={plan?.confirmation_source || ""} placeholder="Ex.: WhatsApp do hotel, recepção" />
              </label>

              <label className="add-field">
                <span>Evidência ou detalhe</span>
                <textarea name="confirmation_note" rows={3} defaultValue={plan?.confirmation_note || ""} placeholder="O que foi confirmado?" />
              </label>

              <label className="add-field">
                <span>Nota operacional</span>
                <textarea name="notes" rows={3} defaultValue={plan?.notes || ""} placeholder="Ex.: voltar ao hotel antes de seguir para a rodoviária" />
              </label>

              {error && <p className="add-error" role="alert">{error}</p>}

              <div className="add-form-actions">
                <button type="button" className="add-secondary" onClick={() => setEditing(false)}>Cancelar</button>
                <button type="submit" className="add-primary" disabled={saving}>
                  {saving ? "Salvando..." : <><Check size={15} /> Salvar</>}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
