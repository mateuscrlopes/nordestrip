"use client";

import { createClient } from "@/lib/supabase/client";
import { Archive, MoreHorizontal, Pencil, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type TableName =
  | "pending_items"
  | "reservations"
  | "itinerary_items"
  | "accommodations"
  | "transport_segments"
  | "expenses"
  | "documents"
  | "places";

type FieldType = "text" | "date" | "datetime-local" | "number" | "url" | "textarea" | "select" | "checkbox";

export type EditField = {
  name: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
  step?: string;
  min?: string;
  options?: { value: string; label: string }[];
};

type FieldValue = string | number | boolean | null | undefined;

function normalizeDateTime(value: FieldValue) {
  if (!value || typeof value !== "string") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function RecordActions({
  table,
  id,
  title,
  fields,
  values,
  archiveWarning,
}: {
  table: TableName;
  id: string;
  title: string;
  fields: EditField[];
  values: Record<string, FieldValue>;
  archiveWarning?: string;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {};

    for (const field of fields) {
      if (field.type === "checkbox") {
        payload[field.name] = form.get(field.name) === "on";
        continue;
      }

      const raw = String(form.get(field.name) ?? "").trim();

      if (!raw) {
        payload[field.name] = null;
        continue;
      }

      if (field.type === "number") {
        const parsed = Number(raw.replace(",", "."));
        if (!Number.isFinite(parsed)) {
          setError(`Valor inválido em ${field.label}.`);
          return;
        }
        payload[field.name] = parsed;
        continue;
      }

      if (field.type === "datetime-local") {
        payload[field.name] = new Date(raw).toISOString();
        continue;
      }

      payload[field.name] = raw;
    }

    if (table === "reservations") {
      const total = typeof payload.total_amount === "number" ? payload.total_amount : null;
      const paid = typeof payload.paid_amount === "number" ? payload.paid_amount : 0;
      if (total != null && paid > total) {
        setError("O valor pago não pode ser maior que o valor total.");
        return;
      }
    }

    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: updateError } = await supabase.from(table).update(payload).eq("id", id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setEditing(false);
    setMenuOpen(false);
    router.refresh();
  }

  async function archive() {
    const message = archiveWarning
      ? `${archiveWarning}\n\nO registro será arquivado, não apagado. Deseja continuar?`
      : `Arquivar “${title}”?\n\nO registro será arquivado, não apagado.`;

    if (!window.confirm(message)) return;

    setArchiving(true);
    setError("");
    const supabase = createClient();
    const { error: archiveError } = await supabase
      .from(table)
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);

    if (archiveError) {
      setError(archiveError.message);
      setArchiving(false);
      return;
    }

    setArchiving(false);
    setMenuOpen(false);
    router.refresh();
  }

  return (
    <div className="record-actions">
      <button
        type="button"
        className="record-actions-trigger"
        aria-label={`Ações de ${title}`}
        onClick={() => setMenuOpen((value) => !value)}
      >
        <MoreHorizontal size={17} />
      </button>

      {menuOpen && (
        <div className="record-actions-menu">
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setMenuOpen(false);
              setError("");
            }}
          >
            <Pencil size={15} />
            Editar
          </button>
          <button type="button" className="is-danger" disabled={archiving} onClick={archive}>
            <Archive size={15} />
            {archiving ? "Arquivando..." : "Arquivar"}
          </button>
        </div>
      )}

      {editing && (
        <div className="edit-overlay" onClick={() => setEditing(false)}>
          <section className="edit-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="edit-sheet-header">
              <div>
                <p>Editar</p>
                <h2>{title}</h2>
              </div>
              <button type="button" aria-label="Fechar" className="add-icon-button" onClick={() => setEditing(false)}>
                <X size={19} />
              </button>
            </div>

            <form onSubmit={save} className="add-form">
              {fields.map((field) => {
                const type = field.type || "text";
                const current = values[field.name];

                if (type === "textarea") {
                  return (
                    <label key={field.name} className="add-field">
                      <span>{field.label}</span>
                      <textarea name={field.name} rows={3} defaultValue={typeof current === "string" ? current : ""} placeholder={field.placeholder} />
                    </label>
                  );
                }

                if (type === "select") {
                  return (
                    <label key={field.name} className="add-field">
                      <span>{field.label}</span>
                      <select name={field.name} defaultValue={current == null ? "" : String(current)} required={field.required}>
                        {!field.required && <option value="">Não informado</option>}
                        {(field.options || []).map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  );
                }

                if (type === "checkbox") {
                  return (
                    <label key={field.name} className="add-check">
                      <input name={field.name} type="checkbox" defaultChecked={Boolean(current)} />
                      <span>{field.label}</span>
                    </label>
                  );
                }

                return (
                  <label key={field.name} className="add-field">
                    <span>{field.label}</span>
                    <input
                      name={field.name}
                      type={type}
                      required={field.required}
                      step={field.step}
                      min={field.min}
                      placeholder={field.placeholder}
                      defaultValue={
                        type === "datetime-local"
                          ? normalizeDateTime(current)
                          : current == null
                            ? ""
                            : String(current)
                      }
                    />
                  </label>
                );
              })}

              {error && <p className="add-error" role="alert">{error}</p>}

              <div className="add-form-actions">
                <button type="button" className="add-secondary" onClick={() => setEditing(false)}>Cancelar</button>
                <button type="submit" className="add-primary" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar alterações"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
