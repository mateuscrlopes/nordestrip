"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";

const options = ["Descobri algo", "Atividade", "Transporte", "Hospedagem", "Gasto", "Reserva", "Nota ou documento"];

export function GlobalAdd() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Adicionar"
        className="fixed right-6 z-[45] grid size-[46px] place-items-center rounded-full border border-white/35 bg-petrol text-white shadow-[0_8px_22px_rgba(18,56,68,.16)] hover:bg-[#0d303a] active:scale-[.97] md:right-[calc(50%-19rem)]"
        style={{ bottom: "calc(max(.45rem, env(safe-area-inset-bottom)) + 4.65rem)" }}
      >
        <Plus size={20} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-ink/25 p-3" onClick={() => setOpen(false)}>
          <section
            className="mx-auto w-full max-w-lg rounded-[26px] bg-surface p-5 shadow-[0_18px_50px_rgba(23,40,46,.15)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="section-title">Adicionar</h2>
              <button aria-label="Fechar" onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-pale-blue/35">
                <X size={20} />
              </button>
            </div>

            <div className="divide-y divide-petrol/6">
              {options.map((option) => (
                <button
                  key={option}
                  className="block min-h-12 w-full py-3 text-left text-sm font-medium hover:text-petrol"
                  onClick={() => setOpen(false)}
                >
                  {option}
                </button>
              ))}
            </div>

            <p className="mt-3 text-xs leading-5 text-muted">Os formulários serão disponibilizados em uma próxima etapa.</p>
          </section>
        </div>
      )}
    </>
  );
}
