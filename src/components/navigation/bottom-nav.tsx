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

export function BottomNav({ action }: { action?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(.45rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto mx-auto flex max-w-[650px] items-center rounded-[24px] border border-petrol/8 bg-surface p-1.5 shadow-[0_10px_28px_rgba(23,40,46,.10)]">
        <nav className="min-w-0 flex-1" aria-label="Navegação principal">
          <div className="grid grid-cols-5 gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-[17px] px-1 text-[10.5px] font-medium ${active ? "bg-petrol text-white" : "text-muted hover:bg-pale-blue/35 hover:text-petrol"}`}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{label}</span>
              </Link>
            );
          })}
          </div>
        </nav>
        {action && (
          <div className="ml-1 flex h-[48px] w-[50px] shrink-0 items-center justify-center border-l border-petrol/8 pl-1">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}
