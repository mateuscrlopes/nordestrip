"use client";

import { createClient } from "@/lib/supabase/client";
import { Route } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });

    if (authError) {
      setError("E-mail ou senha não conferem.");
      setLoading(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main className="login-shell grid min-h-screen place-items-center px-5 py-12">
      <section className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-[17px] bg-petrol text-white shadow-soft">
            <Route size={21} strokeWidth={1.9} />
          </span>
          <span className="text-[1.65rem] font-semibold tracking-[-.045em]">Nordestrip</span>
        </div>

        <h1 className="text-[2rem] font-semibold leading-tight tracking-[-.04em]">Entrar</h1>
        <p className="mt-2 text-[14px] leading-6 text-muted">Use seu e-mail e senha para acessar a viagem.</p>

        <form onSubmit={login} className="mt-8 space-y-5 rounded-[24px] border border-white/80 bg-surface/90 p-6 shadow-soft">
          <label className="block text-sm font-medium">
            E-mail
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="seu@email.com"
              className="mt-2 w-full rounded-2xl border border-petrol/10 bg-white/80 px-4 py-3.5 outline-none transition focus:border-petrol/50 focus:ring-4 focus:ring-pale-blue/45"
            />
          </label>

          <label className="block text-sm font-medium">
            Senha
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Sua senha"
              className="mt-2 w-full rounded-2xl border border-petrol/10 bg-white/80 px-4 py-3.5 outline-none transition focus:border-petrol/50 focus:ring-4 focus:ring-pale-blue/45"
            />
          </label>

          {error && <p role="alert" className="text-sm text-red-800">{error}</p>}

          <button
            disabled={loading}
            className="w-full rounded-2xl bg-petrol px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#0d303a] active:scale-[.99] disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
