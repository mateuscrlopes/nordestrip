import { AcceptInvite } from "@/components/participants/accept-invite";
import { createClient } from "@/lib/supabase/server";
import { CalendarDays, ShieldCheck, Users } from "lucide-react";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const [{ data: preview, error: previewError }, { data: authData }] = await Promise.all([
    supabase.rpc("get_trip_invite_preview", { p_token: token }).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  const invalid = previewError || !preview;
  const status = preview?.invite_status;

  return (
    <main className="invite-shell">
      <section className="invite-card">
        <div className="invite-brand">
          <span className="invite-ghumat-mark" aria-hidden="true" />
          <span>Nordestrip</span>
        </div>

        {invalid ? (
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

            <AcceptInvite token={token} authenticated={Boolean(authData.user)} />
          </>
        )}
      </section>
    </main>
  );
}
