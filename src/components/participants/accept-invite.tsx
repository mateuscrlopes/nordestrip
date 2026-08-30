"use client";

import { createClient } from "@/lib/supabase/client";
import { Check, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AcceptInvite({
  token,
  authenticated,
}: {
  token: string;
  authenticated: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error: acceptError } = await supabase.rpc("accept_trip_invite", {
      p_token: token,
    });

    if (acceptError) {
      setError(acceptError.message);
      setLoading(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  if (!authenticated) {
    const nextPath = `/convite/${token}`;
    return (
      <a className="invite-primary-action" href={`/login?next=${encodeURIComponent(nextPath)}`}>
        <LogIn size={16} />
        Entrar para aceitar
      </a>
    );
  }

  return (
    <div className="invite-accept-actions">
      {error && <p className="add-error" role="alert">{error}</p>}
      <button type="button" className="invite-primary-action" onClick={accept} disabled={loading}>
        <Check size={16} />
        {loading ? "Aceitando..." : "Aceitar convite"}
      </button>
    </div>
  );
}
