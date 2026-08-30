"use client";

import { createClient } from "@/lib/supabase/client";
import { Archive, BadgeCheck, ExternalLink, Footprints, MoreHorizontal, Paperclip, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function ItineraryStatusActions({
  id,
  title,
  status,
}: {
  id: string;
  title: string;
  status: string;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(status);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hasDocument, setHasDocument] = useState(false);
  const [error, setError] = useState("");

  const confirmed = current === "confirmed" || current === "done";
  const visited = current === "done";

  async function update(next: string) {
    if (saving || next === current) return;
    const previous = current;
    setCurrent(next);
    setSaving(true);
    setError("");
    const supabase = createClient();
    const { error: updateError } = await supabase.from("itinerary_items").update({ status: next }).eq("id", id);
    if (updateError) {
      setCurrent(previous);
      setError("Não foi possível atualizar.");
    } else {
      router.refresh();
    }
    setSaving(false);
  }

  function parentActionArea() {
    return rootRef.current?.parentElement ?? null;
  }

  function clickSibling(selector: string) {
    const button = parentActionArea()?.querySelector<HTMLButtonElement>(selector);
    button?.click();
    setMenuOpen(false);
  }

  function toggleMenu() {
    const next = !menuOpen;
    if (next) {
      setHasDocument(Boolean(parentActionArea()?.querySelector(':scope > span button[title^="Abrir"]')));
    }
    setMenuOpen(next);
  }

  return (
    <div ref={rootRef} className="itinerary-status-control">
      <button
        type="button"
        className={`itinerary-visit-button ${visited ? "is-visited" : ""}`}
        aria-label={visited ? `Marcar ${title} como não visitado` : `Marcar ${title} como visitado`}
        title={visited ? "Visitado" : "Marcar como visitado"}
        disabled={saving}
        onClick={() => update(visited ? "confirmed" : "done")}
      >
        <Footprints size={15} />
      </button>

      <button
        type="button"
        className="itinerary-more-button"
        aria-label={`Mais ações de ${title}`}
        aria-expanded={menuOpen}
        title="Mais ações"
        onClick={toggleMenu}
      >
        <MoreHorizontal size={17} />
      </button>

      {menuOpen && (
        <div className="itinerary-actions-popover" role="menu">
          <button type="button" role="menuitem" onClick={() => clickSibling(':scope > button[title="Anexar documento"]')}>
            <Paperclip size={15} />
            Anexar documento
          </button>

          {hasDocument && (
            <button type="button" role="menuitem" onClick={() => clickSibling(':scope > span button[title^="Abrir"]')}>
              <ExternalLink size={15} />
              Abrir documento
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            disabled={saving || visited}
            onClick={() => {
              void update(confirmed ? "planned" : "confirmed");
              setMenuOpen(false);
            }}
          >
            <BadgeCheck size={15} />
            {confirmed ? "Remover confirmação" : "Confirmar"}
          </button>

          <button type="button" role="menuitem" onClick={() => clickSibling(':scope > .record-actions button[title="Editar"]')}>
            <Pencil size={15} />
            Editar
          </button>

          <button
            type="button"
            role="menuitem"
            className="is-danger"
            onClick={() => clickSibling(':scope > .record-actions button[title="Arquivar"]')}
          >
            <Archive size={15} />
            Arquivar
          </button>
        </div>
      )}

      {error && <span className="sr-only" role="status">{error}</span>}
    </div>
  );
}
