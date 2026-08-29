"use client";
import { Banknote, CalendarDays, Compass, House, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [{ href: "/", label: "Início", icon: House }, { href: "/roteiro", label: "Roteiro", icon: CalendarDays }, { href: "/mapa", label: "Mapa", icon: Compass }, { href: "/dinheiro", label: "Dinheiro", icon: Banknote }, { href: "/mais", label: "Mais", icon: Menu }];
export function BottomNav() {
  const pathname = usePathname();
  return <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-2xl border-t border-petrol/5 bg-surface px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2">
    <div className="flex justify-around">{links.map(({ href, label, icon: Icon }) => { const active = href === "/" ? pathname === "/" : pathname.startsWith(href); return <Link key={href} href={href} className={`flex min-w-[58px] flex-col items-center gap-1 rounded-2xl px-2 py-1.5 text-[11px] font-medium ${active ? "bg-petrol text-white" : "text-muted"}`}><Icon size={19} strokeWidth={1.8}/><span>{label}</span></Link>; })}</div>
  </nav>;
}
