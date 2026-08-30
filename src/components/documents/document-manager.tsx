"use client";

import { createClient } from "@/lib/supabase/client";
import { ExternalLink, FileUp, Paperclip, X } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type StopOption = { id: string; name: string };

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(-120) || "arquivo";
}

export function DocumentUploadButton({
  tripId,
  stops = [],
  defaultStopId,
  reservationId,
  accommodationId,
  transportSegmentId,
  itineraryItemId,
  defaultType = "other",
  defaultTitle = "",
  compact = false,
}: {
  tripId: string;
  stops?: StopOption[];
  defaultStopId?: string | null;
  reservationId?: string | null;
  accommodationId?: string | null;
  transportSegmentId?: string | null;
  itineraryItemId?: string | null;
  defaultType?: string;
  defaultTitle?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    const externalUrl = String(form.get("external_url") || "").trim() || null;
    const title = String(form.get("title") || "").trim();
    const stopId = String(form.get("stop_id") || "").trim() || defaultStopId || null;

    if (!title) {
      setError("Informe um título.");
      return;
    }
    if (!(file instanceof File) || file.size === 0) {
      if (!externalUrl) {
        setError("Escolha um PDF/imagem ou informe um link.");
        return;
      }
    }
    if (file instanceof File && file.size > 15 * 1024 * 1024) {
      setError("O arquivo deve ter no máximo 15 MB.");
      return;
    }

    setSaving(true);
    setError("");
    const supabase = createClient();
    let storagePath: string | null = null;

    if (file instanceof File && file.size > 0) {
      const path = `${tripId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const upload = await supabase.storage
        .from("trip-documents")
        .upload(path, file, {
          upsert: false,
          contentType: file.type || undefined,
        });

      if (upload.error) {
        setError(upload.error.message);
        setSaving(false);
        return;
      }
      storagePath = upload.data.path;
    }

    const { error: insertError } = await supabase.from("documents").insert({
      trip_id: tripId,
      stop_id: stopId,
      reservation_id: reservationId || null,
      accommodation_id: accommodationId || null,
      transport_segment_id: transportSegmentId || null,
      itinerary_item_id: itineraryItemId || null,
      title,
      document_type: String(form.get("document_type") || defaultType || "other"),
      storage_path: storagePath,
      external_url: externalUrl,
      is_essential: form.get("is_essential") === "on",
      available_offline: false,
      notes: String(form.get("notes") || "").trim() || null,
    });

    if (insertError) {
      if (storagePath) {
        await supabase.storage.from("trip-documents").remove([storagePath]);
      }
      setError(insertError.message);
      setSaving(false);
      return;
    }

    formRef.current?.reset();
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className={compact ? "add-icon-button" : "inline-flex min-h-9 items-center gap-2 rounded-xl bg-petrol px-3 text-[11px] font-semibold text-white"}
        aria-label={compact ? "Anexar documento" : undefined}
        title="Anexar documento"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        {compact ? <Paperclip size={15} /> : <><FileUp size={15} /> Anexar arquivo</>}
      </button>

      {open && (
        <div className="edit-overlay" onClick={() => !saving && setOpen(false)}>
          <section className="edit-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="edit-sheet-header">
              <div>
                <p>Documento</p>
                <h2>Anexar arquivo</h2>
              </div>
              <button type="button" className="add-icon-button" aria-label="Fechar" onClick={() => setOpen(false)}>
                <X size={19} />
              </button>
            </div>

            <form ref={formRef} onSubmit={submit} className="add-form">
              <label className="add-field">
                <span>Título</span>
                <input name="title" required defaultValue={defaultTitle} placeholder="Ex.: passagem LATAM, voucher do hotel..." />
              </label>

              {!defaultStopId && stops.length > 0 && (
                <label className="add-field">
                  <span>Cidade</span>
                  <select name="stop_id" defaultValue="">
                    <option value="">Viagem inteira</option>
                    {stops.map((stop) => <option key={stop.id} value={stop.id}>{stop.name}</option>)}
                  </select>
                </label>
              )}

              <label className="add-field">
                <span>Categoria</span>
                <select name="document_type" defaultValue={defaultType}>
                  <option value="ticket">Passagem ou ingresso</option>
                  <option value="voucher">Voucher</option>
                  <option value="booking">Reserva</option>
                  <option value="receipt">Comprovante</option>
                  <option value="personal">Documento pessoal</option>
                  <option value="insurance">Seguro</option>
                  <option value="other">Outro</option>
                </select>
              </label>

              <label className="add-field">
                <span>PDF ou imagem</span>
                <input name="file" type="file" accept="application/pdf,image/*" />
                <small className="mt-1 block text-[10px] text-muted">Até 15 MB. O arquivo fica privado no Supabase.</small>
              </label>

              <label className="add-field">
                <span>Link, se preferir</span>
                <input name="external_url" type="url" inputMode="url" placeholder="https://..." />
              </label>

              <label className="add-check">
                <input name="is_essential" type="checkbox" defaultChecked={Boolean(transportSegmentId || accommodationId)} />
                <span>Essencial durante a viagem</span>
              </label>

              <label className="add-field">
                <span>Nota</span>
                <textarea name="notes" rows={2} />
              </label>

              {error && <p className="add-error" role="alert">{error}</p>}

              <div className="add-form-actions">
                <button type="button" className="add-secondary" disabled={saving} onClick={() => setOpen(false)}>Cancelar</button>
                <button type="submit" className="add-primary" disabled={saving}>{saving ? "Salvando..." : "Salvar documento"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

export function DocumentOpenButton({
  storagePath,
  externalUrl,
  label = "Abrir documento",
}: {
  storagePath?: string | null;
  externalUrl?: string | null;
  label?: string;
}) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  async function openDocument() {
    if (externalUrl && !storagePath) {
      window.open(externalUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (!storagePath) return;

    setOpening(true);
    setError("");
    const supabase = createClient();
    const { data, error: signedError } = await supabase.storage
      .from("trip-documents")
      .createSignedUrl(storagePath, 60 * 10);

    if (signedError || !data?.signedUrl) {
      setError("Não foi possível abrir.");
      setOpening(false);
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    setOpening(false);
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        className="add-icon-button"
        aria-label={label}
        title={label}
        disabled={opening || (!storagePath && !externalUrl)}
        onClick={openDocument}
      >
        <ExternalLink size={15} />
      </button>
      {error && <small className="text-[9px] text-muted" role="status">{error}</small>}
    </span>
  );
}
