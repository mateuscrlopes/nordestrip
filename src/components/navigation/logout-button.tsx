"use client";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
export function LogoutButton() { const router = useRouter(); return <button className="text-sm font-semibold text-petrol" onClick={async () => { await createClient().auth.signOut(); router.replace("/login"); router.refresh(); }}>Sair da conta</button>; }
