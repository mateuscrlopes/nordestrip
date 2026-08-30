"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

function clearOfflineTripData() {
  try {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith("nordestrip:offline:")) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Falha de armazenamento local não deve impedir o logout.
  }
}

export function LogoutButton() {
  const router = useRouter();

  return (
    <button
      className="text-sm font-semibold text-petrol"
      onClick={async () => {
        clearOfflineTripData();
        await createClient().auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      Sair da conta
    </button>
  );
}
