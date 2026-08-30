"use client";

import { createClient } from "@/lib/supabase/client";
import { Plus, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type StopOption = { id: string; name: string };

export function PendingItemCreator({
  tripId,
  stops,
}: {
  tripId: string;
  stops: StopOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    const dueAt = String(form.get("due_at") || "").trim();

    if (!title) {
      setError("Informe a pendência.");
      return;
    }

    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: insertError } = await supabase.from("pending_items").insert({
      trip_id: tripId,
      stop_id: String(form.get("stop_id") || "").trim() || null,
      title,
      description: String(form.get("description") || "").trim() || null,
      priority: String(form.get("priority") || "medium"),
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      status: "pending",
      source: "manual",
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="inline-add-button" onClick={() => { setError(""); setOpen(true); }}>
        <Plus size={14} />
        Adicionar pendência
      </button>

      {open && (
        <div className="edit-overlay" onClick={() => setOpen(false)}>
          <section className="edit-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="edit-sheet-header">
              <div>
                <p>Planejamento</p>
                <h2>Nova pendência</h2>
              </div>
              <button type="button" className="add-icon-button" aria-label="Fechar" onClick={() => setOpen(false)}>
                <X size={19} />
              </button>
            </div>

            <form onSubmit={submit} className="add-form">
              <label className="add-field">
                <span>Pendência</span>
                <input name="title" required placeholder="Ex.: comprar retorno Salvador → Vitória" />
              </label>

              <label className="add-field">
                <span>Cidade</span>
                <select name="stop_id" defaultValue="">
                  <option value="">Sem cidade específica</option>
                  {stops.map((stop) => (
                    <option key={stop.id} value={stop.id}>{stop.name}</option>
                  ))}
                </select>
              </label>

              <div className="add-grid">
                <label className="add-field">
                  <span>Prioridade</span>
                  <select name="priority" defaultValue="medium">
                    <option value="high">Alta</option>
                    <option value="medium">Média</option>
                    <option value="low">Baixa</option>
                  </select>
                </label>
                <label className="add-field">
                  <span>Prazo</span>
                  <input name="due_at" type="datetime-local" />
                </label>
              </div>

              <label className="add-field">
                <span>Descrição</span>
                <textarea name="description" rows={3} placeholder="O que precisa ser decidido ou confirmado?" />
              </label>

              {error && <p className="add-error" role="alert">{error}</p>}

              <div className="add-form-actions">
                <button type="button" className="add-secondary" onClick={() => setOpen(false)}>Cancelar</button>
                <button type="submit" className="add-primary" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar pendência"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
