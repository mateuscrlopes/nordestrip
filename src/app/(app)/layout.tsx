import { BottomNav } from "@/components/navigation/bottom-nav";
import { GlobalAdd } from "@/components/navigation/global-add";
import { getCurrentUser } from "@/lib/queries/trips";
import { redirect } from "next/navigation";
export default async function AppLayout({ children }: { children: React.ReactNode }) { const user = await getCurrentUser(); if (!user) redirect("/login"); return <div className="mx-auto min-h-screen max-w-2xl px-5 pb-32 pt-6 md:px-8 md:pt-10">{children}<GlobalAdd/><BottomNav/></div>; }
