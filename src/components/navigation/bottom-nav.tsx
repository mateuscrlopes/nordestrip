"use client";

import { Banknote, CalendarDays, Compass, House, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Início", icon: House },
  { href: "/roteiro", label: "Roteiro", icon: CalendarDays },
  { href: "/mapa", label: "Mapa", icon: Compass },
  { href: "/dinheiro", label: "Dinheiro", icon: Banknote },
  { href: "/mais", label: "Mais", icon: Menu },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
      <nav className="pointer-events-auto mx-auto max-w-[620px] rounded-[25px] border border-petrol/8 bg-surface px-2 py-2 shadow-[0_12px_34px_rgba(23,40,46,.12)]" aria-label="Navegação principal">
        <div className="grid grid-cols-5 gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-[18px] px-1 text-[10.5px] font-medium ${active ? "bg-petrol text-white" : "text-muted hover:bg-pale-blue/35 hover:text-petrol"}`}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
