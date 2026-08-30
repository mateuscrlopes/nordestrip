"use client";

import { accommodationStatusOptions } from "@/components/actions/record-status";
import { createClient } from "@/lib/supabase/client";
import { Archive, Pencil, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type AccommodationValue = {
  id: string;
  name: string;
  accommodation_type?: string | null;
  status?: string | null;
  check_in_date?: string | null;
  check_out_date?: string | null;
  check_in_from?: string | null;
  check_out_until?: string | null;
  source_url?: string | null;
  notes?: string | null;
};

export function AccommodationEditor({
  tripId,
  accommodation,
  address,
}: {
  tripId: string;
  accommodation: AccommodationValue;
  address?: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const checkInDate = String(form.get("check_in_date") || "").trim() || null;
    const checkOutDate = String(form.get("check_out_date") || "").trim() || null;

    if (!name) {
      setError("Informe o nome da hospedagem.");
      return;
    }

    if (checkInDate && checkOutDate && checkOutDate < checkInDate) {
      setError("O check-out não pode ser anterior ao check-in.");
      return;
    }

    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: updateError } = await supabase.rpc("update_accommodation_with_place", {
      p_trip_id: tripId,
      p_accommodation_id: accommodation.id,
      p_name: name,
      p_accommodation_type: String(form.get("accommodation_type") || "").trim() || null,
      p_status: String(form.get("status") || "researching"),
      p_address: String(form.get("address") || "").trim() || null,
      p_check_in_date: checkInDate,
      p_check_out_date: checkOutDate,
      p_check_in_from: String(form.get("check_in_from") || "").trim() || null,
      p_check_out_until: String(form.get("check_out_until") || "").trim() || null,
      p_source_url: String(form.get("source_url") || "").trim() || null,
      p_notes: String(form.get("notes") || "").trim() || null,
    });

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  async function archive() {
    if (!window.confirm(`Arquivar “${accommodation.name}”?\n\nA hospedagem será arquivada, não apagada.`)) return;

    setArchiving(true);
    setError("");
    const supabase = createClient();
    const { error: archiveError } = await supabase
      .from("accommodations")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", accommodation.id)
      .eq("trip_id", tripId);

    if (archiveError) {
      setError(archiveError.message);
      setArchiving(false);
      return;
    }

    setArchiving(false);
    router.refresh();
  }

  return (
    <div className="record-actions">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="add-icon-button"
          aria-label={`Editar ${accommodation.name}`}
          onClick={() => { setEditing(true); setError(""); }}
        >
          <Pencil size={16} />
        </button>
        <button
          type="button"
          className="add-icon-button"
          aria-label={`Arquivar ${accommodation.name}`}
          disabled={archiving}
          onClick={archive}
        >
          <Archive size={16} />
        </button>
      </div>

      {editing && (
        <div className="edit-overlay" onClick={() => setEditing(false)}>
          <section className="edit-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="edit-sheet-header">
              <div>
                <p>Hospedagem</p>
                <h2>{accommodation.name}</h2>
              </div>
              <button type="button" className="add-icon-button" aria-label="Fechar" onClick={() => setEditing(false)}>
                <X size={19} />
              </button>
            </div>

            <form onSubmit={save} className="add-form">
              <label className="add-field">
                <span>Hospedagem</span>
                <input name="name" required defaultValue={accommodation.name} />
              </label>

              <div className="add-grid">
                <label className="add-field">
                  <span>Tipo</span>
                  <select name="accommodation_type" defaultValue={accommodation.accommodation_type || "hotel"}>
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
                  <select name="status" defaultValue={accommodation.status || "researching"}>
                    {accommodationStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="add-field">
                <span>Endereço</span>
                <input name="address" defaultValue={address || ""} placeholder="Rua, número, bairro ou referência" />
              </label>

              <div className="add-grid">
                <label className="add-field">
                  <span>Check-in</span>
                  <input name="check_in_date" type="date" defaultValue={accommodation.check_in_date || ""} />
                </label>
                <label className="add-field">
                  <span>Check-out</span>
                  <input name="check_out_date" type="date" defaultValue={accommodation.check_out_date || ""} />
                </label>
              </div>

              <div className="add-grid">
                <label className="add-field">
                  <span>Check-in a partir de</span>
                  <input name="check_in_from" type="time" defaultValue={accommodation.check_in_from?.slice(0, 5) || ""} />
                </label>
                <label className="add-field">
                  <span>Check-out até</span>
                  <input name="check_out_until" type="time" defaultValue={accommodation.check_out_until?.slice(0, 5) || ""} />
                </label>
              </div>

              <label className="add-field">
                <span>Link</span>
                <input name="source_url" type="url" inputMode="url" defaultValue={accommodation.source_url || ""} />
              </label>

              <label className="add-field">
                <span>Nota</span>
                <textarea name="notes" rows={3} defaultValue={accommodation.notes || ""} />
              </label>

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
