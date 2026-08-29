"use client";

import { createClient } from "@/lib/supabase/client";
import type { Stop } from "@/types/trip";
import { Archive, MapPinPlus, MoreHorizontal, Pencil, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type DependencyCounts = {
  activities: number;
  accommodations: number;
  pending: number;
  transports: number;
  luggage: number;
  reservations: number;
  documents: number;
  places: number;
};

const dependencyLabels: Record<keyof DependencyCounts, string> = {
  activities: "atividades",
  accommodations: "hospedagens",
  pending: "pendências",
  transports: "deslocamentos",
  luggage: "planos de bagagem",
  reservations: "reservas",
  documents: "documentos",
  places: "lugares",
};

function cityName(stop?: Stop | null) {
  return stop?.city || stop?.name || "Cidade";
}

export function RouteCityManager({
  tripId,
  stop,
  mode = "edit",
}: {
  tripId: string;
  stop?: Stop | null;
  mode?: "add" | "edit";
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkingArchive, setCheckingArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [dependencies, setDependencies] = useState<DependencyCounts | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const stateCode = String(form.get("state_code") || "").trim().toUpperCase() || null;
    const startDate = String(form.get("start_date") || "").trim() || null;
    const endDate = String(form.get("end_date") || "").trim() || null;
    const notes = String(form.get("notes") || "").trim() || null;

    if (!name) {
      setError("Informe o nome da cidade.");
      return;
    }

    if (startDate && endDate && endDate < startDate) {
      setError("A data final não pode ser anterior à data inicial.");
      return;
    }

    setSaving(true);
    setError("");
    const supabase = createClient();

    if (mode === "add") {
      const { error: addError } = await supabase.rpc("add_trip_stop", {
        p_trip_id: tripId,
        p_name: name,
        p_state_code: stateCode,
        p_start_date: startDate,
        p_end_date: endDate,
        p_notes: notes,
      });

      if (addError) {
        setError(addError.message);
        setSaving(false);
        return;
      }
    } else if (stop) {
      const { error: updateError } = await supabase
        .from("stops")
        .update({
          name,
          state_code: stateCode,
          start_date: startDate,
          end_date: endDate,
          notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", stop.id)
        .eq("trip_id", tripId);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setOpen(false);
    setMenuOpen(false);
    router.refresh();
  }

  async function inspectArchive() {
    if (!stop) return;

    setCheckingArchive(true);
    setError("");
    const supabase = createClient();
    const { data, error: dependencyError } = await supabase.rpc("get_stop_dependency_counts", {
      p_trip_id: tripId,
      p_stop_id: stop.id,
    });

    if (dependencyError) {
      setError(dependencyError.message);
      setCheckingArchive(false);
      return;
    }

    setDependencies((data || {}) as DependencyCounts);
    setCheckingArchive(false);
    setArchiveOpen(true);
    setMenuOpen(false);
  }

  async function archive() {
    if (!stop) return;

    setArchiving(true);
    setError("");
    const supabase = createClient();
    const { error: archiveError } = await supabase.rpc("archive_trip_stop", {
      p_trip_id: tripId,
      p_stop_id: stop.id,
    });

    if (archiveError) {
      setError(archiveError.message);
      setArchiving(false);
      return;
    }

    setArchiving(false);
    setArchiveOpen(false);
    router.refresh();
  }

  const dependencyTotal = dependencies
    ? Object.values(dependencies).reduce((sum, value) => sum + Number(value || 0), 0)
    : 0;

  if (mode === "add") {
    return (
      <>
        <button type="button" className="route-edit-secondary" onClick={() => { setError(""); setOpen(true); }}>
          <MapPinPlus size={14} />
          Adicionar cidade
        </button>

        {open && (
          <div className="edit-overlay" onClick={() => setOpen(false)}>
            <section className="edit-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="edit-sheet-header">
                <div>
                  <p>Estrutura da rota</p>
                  <h2>Adicionar cidade</h2>
                </div>
                <button type="button" className="add-icon-button" aria-label="Fechar" onClick={() => setOpen(false)}>
                  <X size={19} />
                </button>
              </div>

              <CityForm onSubmit={save} saving={saving} error={error} />
            </section>
          </div>
        )}
      </>
    );
  }

  if (!stop) return null;

  return (
    <>
      <div className="route-city-actions">
        <button
          type="button"
          className="record-actions-trigger"
          aria-label={`Ações de ${cityName(stop)}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setMenuOpen((value) => !value);
          }}
        >
          <MoreHorizontal size={17} />
        </button>

        {menuOpen && (
          <div className="record-actions-menu">
            <button type="button" onClick={() => { setOpen(true); setMenuOpen(false); setError(""); }}>
              <Pencil size={15} />
              Editar cidade
            </button>
            <button type="button" className="is-danger" onClick={inspectArchive} disabled={checkingArchive}>
              <Archive size={15} />
              {checkingArchive ? "Verificando..." : "Arquivar cidade"}
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="edit-overlay" onClick={() => setOpen(false)}>
          <section className="edit-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="edit-sheet-header">
              <div>
                <p>Editar cidade</p>
                <h2>{cityName(stop)}</h2>
              </div>
              <button type="button" className="add-icon-button" aria-label="Fechar" onClick={() => setOpen(false)}>
                <X size={19} />
              </button>
            </div>

            <CityForm stop={stop} onSubmit={save} saving={saving} error={error} />
          </section>
        </div>
      )}

      {archiveOpen && (
        <div className="edit-overlay" onClick={() => setArchiveOpen(false)}>
          <section className="edit-sheet route-impact-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="edit-sheet-header">
              <div>
                <p>Arquivar cidade</p>
                <h2>{cityName(stop)}</h2>
              </div>
              <button type="button" className="add-icon-button" aria-label="Fechar" onClick={() => setArchiveOpen(false)}>
                <X size={19} />
              </button>
            </div>

            <div className="route-impact-body">
              {dependencyTotal > 0 ? (
                <>
                  <div className="route-impact-warning">
                    <strong>Esta cidade ainda tem registros ativos</strong>
                    <span>
                      Para evitar perda de contexto, o Nordestrip não arquiva a cidade enquanto houver itens vinculados.
                    </span>
                  </div>

                  <div className="city-dependency-list">
                    {dependencies && Object.entries(dependencies)
                      .filter(([, count]) => Number(count) > 0)
                      .map(([key, count]) => (
                        <div key={key}>
                          <span>{dependencyLabels[key as keyof DependencyCounts]}</span>
                          <strong>{Number(count)}</strong>
                        </div>
                      ))}
                  </div>

                  <button type="button" className="add-secondary" onClick={() => setArchiveOpen(false)}>
                    Entendi
                  </button>
                </>
              ) : (
                <>
                  <div className="route-impact-summary">
                    <strong>A cidade pode ser arquivada com segurança</strong>
                    <span>
                      Nenhum registro ativo está vinculado a ela. O item continuará disponível em Dados e histórico para restauração.
                    </span>
                  </div>

                  {error && <p className="add-error" role="alert">{error}</p>}

                  <div className="route-impact-actions">
                    <button type="button" className="add-secondary" onClick={() => setArchiveOpen(false)}>
                      Cancelar
                    </button>
                    <button type="button" className="add-primary" disabled={archiving} onClick={archive}>
                      {archiving ? "Arquivando..." : "Arquivar cidade"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function CityForm({
  stop,
  onSubmit,
  saving,
  error,
}: {
  stop?: Stop | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  error: string;
}) {
  return (
    <form onSubmit={onSubmit} className="add-form">
      <label className="add-field">
        <span>Cidade</span>
        <input name="name" required defaultValue={stop?.name || stop?.city || ""} placeholder="Ex.: Porto Seguro" />
      </label>

      <div className="add-grid">
        <label className="add-field">
          <span>UF</span>
          <input name="state_code" maxLength={2} defaultValue={(stop as Stop & { state_code?: string | null })?.state_code || ""} placeholder="BA" />
        </label>
        <label className="add-field">
          <span>País</span>
          <input value="Brasil" disabled />
        </label>
      </div>

      <div className="add-grid">
        <label className="add-field">
          <span>Chegada</span>
          <input name="start_date" type="date" defaultValue={stop?.start_date || ""} />
        </label>
        <label className="add-field">
          <span>Saída</span>
          <input name="end_date" type="date" defaultValue={stop?.end_date || ""} />
        </label>
      </div>

      <label className="add-field">
        <span>Nota</span>
        <textarea
          name="notes"
          rows={3}
          defaultValue={(stop as Stop & { notes?: string | null })?.notes || ""}
          placeholder="Informações estruturais sobre esta parada"
        />
      </label>

      {error && <p className="add-error" role="alert">{error}</p>}

      <div className="add-form-actions">
        <button type="button" className="add-secondary" onClick={() => history.back()}>
          Voltar
        </button>
        <button type="submit" className="add-primary" disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </form>
  );
}
