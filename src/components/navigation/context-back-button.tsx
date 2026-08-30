"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

const rootTabs = new Set(["/", "/roteiro", "/locais", "/mapa", "/dinheiro", "/mais"]);

export function ContextBackButton() {
  const pathname = usePathname();
  const router = useRouter();

  if (rootTabs.has(pathname)) return null;

  return (
    <button
      type="button"
      className="mb-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2 text-[12px] font-semibold text-petrol hover:bg-surface"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push("/roteiro");
        }
      }}
    >
      <ArrowLeft size={16} />
      Voltar
    </button>
  );
}
