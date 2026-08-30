"use client";

import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

function nextPath() {
  if (typeof window === "undefined") return "/";
  const value = new URL(window.location.href).searchParams.get("next");
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const supabase = createClient();

    if (mode === "signup") {
      const name = String(form.get("name") || "").trim();
      const target = nextPath();
      const redirectTo = `${window.location.origin}${target}`;
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: redirectTo,
        },
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (data.session) {
        router.replace(target);
        router.refresh();
        return;
      }

      setNotice("Acesso criado. Confirme seu e-mail para continuar.");
      setLoading(false);
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError("E-mail ou senha não conferem.");
      setLoading(false);
      return;
    }

    router.replace(nextPath());
    router.refresh();
  }

  function switchMode(next: "login" | "signup") {
    setMode(next);
    setError("");
    setNotice("");
  }

  const inputClassName = "mt-2 w-full rounded-2xl border border-petrol/10 bg-white/80 px-4 py-3.5 text-[16px] outline-none transition focus:border-petrol/50 focus:ring-4 focus:ring-pale-blue/45";

  return (
    <main className="login-shell grid min-h-screen place-items-center px-5 py-10 sm:py-12">
      <section className="w-full max-w-sm">
        <div className="mb-9 flex flex-col items-center gap-2.5 text-center">
          <div className="grid h-[72px] w-[104px] place-items-center overflow-hidden">
            <Image
              src="/ghumat-mark.png"
              alt=""
              width={104}
              height={72}
              priority
              className="h-full w-full object-contain"
            />
          </div>
          <span className="text-[1.75rem] font-semibold leading-none tracking-[-.055em] text-ink">
            Nordestrip
          </span>
        </div>

        <h1 className="text-[2rem] font-semibold leading-tight tracking-[-.04em]">
          {mode === "login" ? "Entrar" : "Criar acesso"}
        </h1>
        <p className="mt-2 text-[14px] leading-6 text-muted">
          {mode === "login"
            ? "Use seu e-mail e senha para acessar a viagem."
            : "Crie seu acesso para entrar em uma viagem compartilhada."}
        </p>

        <div className="login-mode-switch" role="tablist" aria-label="Tipo de acesso">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={mode === "login" ? "is-active" : ""}
            onClick={() => switchMode("login")}
          >
            Entrar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            className={mode === "signup" ? "is-active" : ""}
            onClick={() => switchMode("signup")}
          >
            Criar acesso
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-5 rounded-[24px] border border-white/80 bg-surface/90 p-5 shadow-soft sm:p-6">
          {mode === "signup" && (
            <label className="block text-sm font-medium">
              Nome
              <input
                name="name"
                required
                autoComplete="name"
                placeholder="Como quer aparecer na viagem"
                className={inputClassName}
              />
            </label>
          )}

          <label className="block text-sm font-medium">
            E-mail
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="seu@email.com"
              className={inputClassName}
            />
          </label>

          <label className="block text-sm font-medium">
            Senha
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder={mode === "login" ? "Sua senha" : "No mínimo 8 caracteres"}
              className={inputClassName}
            />
          </label>

          {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
          {notice && <p role="status" className="login-notice">{notice}</p>}

          <button
            disabled={loading}
            className="w-full rounded-2xl bg-petrol px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#0d303a] active:scale-[.99] disabled:opacity-60"
          >
            {loading
              ? mode === "login" ? "Entrando..." : "Criando..."
              : mode === "login" ? "Entrar" : "Criar acesso"}
          </button>
        </form>
      </section>
    </main>
  );
}
