"use client";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const router = useRouter(); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function login(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setLoading(true); setError(""); const form = new FormData(event.currentTarget); const supabase = createClient(); const { error: authError } = await supabase.auth.signInWithPassword({ email: String(form.get("email")), password: String(form.get("password")) }); if (authError) { setError("E-mail ou senha não conferem."); setLoading(false); return; } router.replace("/"); router.refresh(); }
  return <main className="grid min-h-screen place-items-center px-5 py-12"><section className="w-full max-w-sm"><p className="eyebrow mb-3">Nordest Trip</p><h1 className="text-4xl font-semibold tracking-[-.045em]">Entrar no Nordest Trip</h1><p className="mt-3 text-sm leading-6 text-muted">Use seu e-mail e senha para acessar a viagem.</p><form onSubmit={login} className="card mt-9 space-y-5 p-6"><label className="block text-sm font-medium">E-mail<input name="email" type="email" required autoComplete="email" placeholder="seu@email.com" className="mt-2 w-full rounded-xl border border-petrol/15 bg-white px-4 py-3 outline-none focus:border-petrol"/></label><label className="block text-sm font-medium">Senha<input name="password" type="password" required autoComplete="current-password" placeholder="Sua senha" className="mt-2 w-full rounded-xl border border-petrol/15 bg-white px-4 py-3 outline-none focus:border-petrol"/></label>{error && <p role="alert" className="text-sm text-red-800">{error}</p>}<button disabled={loading} className="w-full rounded-xl bg-petrol px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{loading ? "Entrando..." : "Entrar"}</button></form></section></main>;
}
