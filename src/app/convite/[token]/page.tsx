"use client";

import { AcceptInvite } from "@/components/participants/accept-invite";
import { createClient } from "@/lib/supabase/client";
import { CalendarDays, ShieldCheck, Users } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type InvitePreview = {
  trip_id: string;
  trip_name: string;
  invited_email: string | null;
  invited_role: string;
  invite_status: string;
  invite_expires_at: string | null;
};

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token || "";
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadInvite() {
      if (!token) {
        setInvalid(true);
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const [previewResult, authResult] = await Promise.all([
        supabase.rpc("get_trip_invite_preview", { p_token: token }),
        supabase.auth.getUser(),
      ]);

      if (cancelled) return;

      if (previewResult.error) {
        setInvalid(true);
      } else {
        const row = Array.isArray(previewResult.data)
          ? previewResult.data[0]
          : previewResult.data;
        setPreview((row || null) as InvitePreview | null);
        setInvalid(!row);
      }

      setAuthenticated(Boolean(authResult.data.user));
      setLoading(false);
    }

    void loadInvite();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <main className="invite-shell">
        <section className="invite-card">
          <div className="invite-brand">
            <span className="invite-ghumat-mark" aria-hidden="true" />
            <span>Nordestrip</span>
          </div>
          <p className="invite-copy">Carregando convite...</p>
        </section>
      </main>
    );
  }

  const status = preview?.invite_status;

  return (
    <main className="invite-shell">
      <section className="invite-card">
        <div className="invite-brand">
          <span className="invite-ghumat-mark" aria-hidden="true" />
          <span>Nordestrip</span>
        </div>

        {invalid || !preview ? (
          <>
            <p className="invite-eyebrow">Convite</p>
            <h1>Este link não é válido.</h1>
            <p className="invite-copy">
              Peça um novo convite para quem administra a viagem.
            </p>
          </>
        ) : status !== "pending" ? (
          <>
            <p className="invite-eyebrow">Convite</p>
            <h1>{status === "expired" ? "Este convite expirou." : "Este convite já foi usado."}</h1>
            <p className="invite-copy">
              Um novo link pode ser gerado na área de participantes.
            </p>
          </>
        ) : (
          <>
            <p className="invite-eyebrow">Você foi convidado</p>
            <h1>Entrar em {preview.trip_name}</h1>
            <p className="invite-copy">
              O acesso compartilha o mesmo roteiro, reservas, decisões e informações da viagem.
            </p>

            <div className="invite-feature-list">
              <div>
                <CalendarDays size={17} />
                <span>Roteiro e cidades em uma única versão</span>
              </div>
              <div>
                <Users size={17} />
                <span>Alterações compartilhadas entre participantes</span>
              </div>
              <div>
                <ShieldCheck size={17} />
                <span>Acesso vinculado ao e-mail do convite</span>
              </div>
            </div>

            <div className="invite-email-note">
              <span>Convite para</span>
              <strong>{preview.invited_email || "participante"}</strong>
            </div>

            <AcceptInvite token={token} authenticated={authenticated} />
          </>
        )}
      </section>
    </main>
  );
}
