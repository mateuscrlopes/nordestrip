"use client";

import { createClient } from "@/lib/supabase/client";
import { Plus, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type PlaceOption = {
  id: string;
  name: string;
  category?: string | null;
};

export function CityItineraryCreator({
  tripId,
  stopId,
  defaultDate,
  places,
}: {
  tripId: string;
  stopId: string;
  defaultDate?: string | null;
  places: PlaceOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [scheduleType, setScheduleType] = useState("none");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    const activityDate = String(form.get("activity_date") || "").trim() || null;
    const startTime = String(form.get("start_time") || "").trim() || null;
    const endTime = String(form.get("end_time") || "").trim() || null;

    if (!title) {
      setError("Informe o que vocês vão fazer.");
      return;
    }
    if (startTime && endTime && endTime <= startTime) {
      setError("O horário final precisa ser posterior ao início.");
      return;
    }

    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: insertError } = await supabase.from("itinerary_items").insert({
      trip_id: tripId,
      stop_id: stopId,
      place_id: String(form.get("place_id") || "").trim() || null,
      title,
      item_type: String(form.get("item_type") || "activity"),
      activity_date: activityDate,
      schedule_type: scheduleType,
      period: scheduleType === "period" ? String(form.get("period") || "").trim() || null : null,
      start_time: ["window", "from", "exact"].includes(scheduleType) ? startTime : null,
      end_time: ["window", "until", "exact"].includes(scheduleType) ? endTime : null,
      is_anchor: scheduleType === "exact",
      status: "planned",
      notes: String(form.get("notes") || "").trim() || null,
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setOpen(false);
    setScheduleType("none");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className="add-icon-button"
        aria-label="Adicionar item ao roteiro da cidade"
        title="Adicionar ao roteiro"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <Plus size={18} />
      </button>

      {open && (
        <div className="edit-overlay" onClick={() => !saving && setOpen(false)}>
          <section className="edit-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="edit-sheet-header">
              <div>
                <p>Roteiro da cidade</p>
                <h2>Novo item</h2>
              </div>
              <button type="button" className="add-icon-button" aria-label="Fechar" onClick={() => setOpen(false)}>
                <X size={19} />
              </button>
            </div>

            <form onSubmit={submit} className="add-form">
              <label className="add-field">
                <span>O que vocês vão fazer?</span>
                <input name="title" required placeholder="Ex.: Museu do Piauí, almoço, passeio..." />
              </label>

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
                  <span>Data</span>
                  <input name="activity_date" type="date" defaultValue={defaultDate || ""} />
                </label>
              </div>

              <label className="add-field">
                <span>Local do catálogo</span>
                <select name="place_id" defaultValue="">
                  <option value="">Nenhum local vinculado</option>
                  {places.map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.name}{place.category ? ` · ${place.category}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="add-field">
                <span>Horário</span>
                <select value={scheduleType} onChange={(event) => setScheduleType(event.target.value)}>
                  <option value="none">Flexível / sem horário</option>
                  <option value="period">Período do dia</option>
                  <option value="window">Janela de horário</option>
                  <option value="from">A partir de</option>
                  <option value="until">Até</option>
                  <option value="exact">Horário marcado</option>
                </select>
              </label>

              {scheduleType === "period" && (
                <label className="add-field">
                  <span>Período</span>
                  <select name="period" defaultValue="morning">
                    <option value="morning">Manhã</option>
                    <option value="afternoon">Tarde</option>
                    <option value="evening">Noite</option>
                  </select>
                </label>
              )}

              {["window", "from", "exact"].includes(scheduleType) && (
                <label className="add-field">
                  <span>Início</span>
                  <input name="start_time" type="time" required />
                </label>
              )}

              {["window", "until", "exact"].includes(scheduleType) && (
                <label className="add-field">
                  <span>Fim {scheduleType === "exact" ? "(opcional)" : ""}</span>
                  <input name="end_time" type="time" required={scheduleType !== "exact"} />
                </label>
              )}

              <label className="add-field">
                <span>Nota</span>
                <textarea name="notes" rows={3} placeholder="Ingresso, observação, plano B..." />
              </label>

              {error && <p className="add-error" role="alert">{error}</p>}

              <div className="add-form-actions">
                <button type="button" className="add-secondary" onClick={() => setOpen(false)}>Cancelar</button>
                <button type="submit" className="add-primary" disabled={saving}>
                  {saving ? "Salvando..." : "Adicionar"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
