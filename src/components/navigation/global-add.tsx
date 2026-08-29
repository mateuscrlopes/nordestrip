"use client";
import { Plus, X } from "lucide-react";
import { useState } from "react";
const options = ["Descobri algo", "Atividade", "Transporte", "Hospedagem", "Gasto", "Reserva", "Nota ou documento"];
export function GlobalAdd() {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)} aria-label="Adicionar" className="fixed bottom-24 right-5 z-30 grid size-14 place-items-center rounded-full bg-petrol text-white shadow-soft md:right-[calc(50%-21rem)]"><Plus/></button>
  {open && <div className="fixed inset-0 z-50 flex items-end bg-ink/25 p-3" onClick={() => setOpen(false)}><section className="mx-auto w-full max-w-lg rounded-card bg-surface p-5 shadow-soft" onClick={(event) => event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><h2 className="section-title">Adicionar</h2><button aria-label="Fechar" onClick={() => setOpen(false)} className="p-2"><X size={20}/></button></div><div className="divide-y divide-petrol/5">{options.map((option) => <button key={option} className="block w-full py-3 text-left text-sm font-medium" onClick={() => setOpen(false)}>{option}</button>)}</div><p className="mt-3 text-xs text-muted">Os formulários serão disponibilizados em uma próxima etapa.</p></section></div>}</>;
}
