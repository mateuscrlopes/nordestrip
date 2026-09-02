"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const rootTabs = new Set(["/", "/roteiro", "/locais", "/mapa", "/dinheiro", "/mais"]);

function safeInternalPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

function contextualFallback(pathname: string) {
  if (pathname.startsWith("/cidade/")) return "/roteiro";
  return "/";
}

export function ContextBackButton() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  if (rootTabs.has(pathname)) return null;

  const explicitOrigin = safeInternalPath(searchParams.get("from"));
  const destination = explicitOrigin || contextualFallback(pathname);

  return (
    <button
      type="button"
      aria-label="Voltar para a tela anterior"
      title="Voltar"
      className="mb-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2 text-[12px] font-semibold text-petrol hover:bg-surface"
      onClick={() => router.push(destination)}
    >
      <ArrowLeft size={16} />
      Voltar
    </button>
  );
}
