"use client";

import { createClient } from "@/lib/supabase/client";
import { Check, Copy, Link2, MailPlus, UserRound, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type ParticipantMember = {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  defaultSplitPercentage: number | null;
};

type Invite = {
  id: string;
  email: string | null;
  role: string;
  status: string;
  expires_at: string | null;
  created_at?: string | null;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "P";
}

function inviteState(invite: Invite) {
  if (invite.status !== "pending") return invite.status;
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) return "expired";
  return "pending";
}

export function ParticipantsManager({
  tripId,
  currentUserId,
  currentRole,
  members,
  invites,
}: {
  tripId: string;
  currentUserId: string;
  currentRole: string;
  members: ParticipantMember[];
  invites: Invite[];
}) {
  const isOwner = currentRole === "owner";
  const [localInvites, setLocalInvites] = useState(invites);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [generatedEmail, setGeneratedEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copiar link");
  const [error, setError] = useState("");

  const activeInvites = useMemo(
    () => localInvites.filter((invite) => inviteState(invite) === "pending"),
    [localInvites],
  );

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();

    if (!email) {
      setError("Informe o e-mail da pessoa.");
      return;
    }

    setCreating(true);
    setError("");
    setGeneratedLink("");
    const supabase = createClient();
    const { data, error: inviteError } = await supabase.rpc("create_trip_invite", {
      p_trip_id: tripId,
      p_email: email,
      p_role: "member",
      p_expires_in_days: 14,
    });

    if (inviteError) {
      setError(inviteError.message);
      setCreating(false);
      return;
    }

    const invite = Array.isArray(data) ? data[0] : data;
    const token = invite?.invite_token;
    if (!token) {
      setError("O convite foi criado, mas o link não pôde ser montado.");
      setCreating(false);
      return;
    }

    const link = `${window.location.origin}/convite/${token}`;
    setGeneratedEmail(email);
    setGeneratedLink(link);
    setCopyLabel("Copiar link");
    setLocalInvites((current) => [
      {
        id: String(invite.invite_id),
        email,
        role: "member",
        status: "pending",
        expires_at: invite.expires_at ? String(invite.expires_at) : null,
      },
      ...current.filter((item) => item.email?.toLowerCase() !== email),
    ]);
    setCreating(false);
  }

  async function copyInvite() {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopyLabel("Link copiado");
      window.setTimeout(() => setCopyLabel("Copiar link"), 1600);
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione o link abaixo.");
    }
  }

  async function revokeInvite(inviteId: string) {
    setError("");
    const supabase = createClient();
    const { error: revokeError } = await supabase
      .from("trip_invites")
      .update({ status: "revoked" })
      .eq("id", inviteId)
      .eq("trip_id", tripId);

    if (revokeError) {
      setError(revokeError.message);
      return;
    }

    setLocalInvites((current) =>
      current.map((invite) => invite.id === inviteId ? { ...invite, status: "revoked" } : invite),
    );
  }

  return (
    <div className="participants-manager">
      <div className="participant-list">
        {members.map((member) => (
          <ParticipantRow
            key={member.id}
            tripId={tripId}
            member={member}
            canEdit={isOwner}
            isCurrentUser={member.userId === currentUserId}
          />
        ))}
      </div>

      {isOwner && (
        <>
          <div className="participant-invite-heading">
            <div>
              <strong>Compartilhar a viagem</strong>
              <span>O convite cria acesso ao mesmo roteiro, sem duplicar os dados.</span>
            </div>
            <button type="button" onClick={() => { setInviteOpen(true); setGeneratedLink(""); setError(""); }}>
              <MailPlus size={15} />
              Convidar
            </button>
          </div>

          {activeInvites.length > 0 && (
            <div className="participant-invite-list">
              {activeInvites.map((invite) => (
                <div key={invite.id}>
                  <span className="participant-avatar participant-avatar--pending"><Link2 size={15} /></span>
                  <div className="min-w-0 flex-1">
                    <strong>{invite.email || "Convite pendente"}</strong>
                    <small>Aguardando acesso</small>
                  </div>
                  <button type="button" onClick={() => revokeInvite(invite.id)}>Revogar</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {error && <p className="add-error" role="alert">{error}</p>}

      {inviteOpen && (
        <div className="edit-overlay" onClick={() => setInviteOpen(false)}>
          <section className="edit-sheet participant-invite-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="edit-sheet-header">
              <div>
                <p>Participantes</p>
                <h2>Convidar para a Nordestrip</h2>
              </div>
              <button type="button" className="add-icon-button" aria-label="Fechar" onClick={() => setInviteOpen(false)}>
                <X size={19} />
              </button>
            </div>

            {!generatedLink ? (
              <form onSubmit={createInvite} className="add-form">
                <label className="add-field">
                  <span>E-mail</span>
                  <input name="email" type="email" required autoComplete="email" placeholder="pessoa@email.com" />
                </label>
                <p className="participant-invite-note">
                  O link vale por 14 dias e só pode ser aceito usando o mesmo e-mail informado.
                </p>
                {error && <p className="add-error" role="alert">{error}</p>}
                <div className="add-form-actions">
                  <button type="button" className="add-secondary" onClick={() => setInviteOpen(false)}>Cancelar</button>
                  <button type="submit" className="add-primary" disabled={creating}>
                    {creating ? "Criando..." : "Criar convite"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="participant-generated-invite">
                <div className="participant-generated-success">
                  <Check size={18} />
                  <div>
                    <strong>Convite criado para {generatedEmail}</strong>
                    <span>Envie este link diretamente para a pessoa.</span>
                  </div>
                </div>

                <label className="add-field">
                  <span>Link do convite</span>
                  <textarea readOnly value={generatedLink} rows={3} onFocus={(event) => event.currentTarget.select()} />
                </label>

                <button type="button" className="participant-copy-link" onClick={copyInvite}>
                  <Copy size={15} />
                  {copyLabel}
                </button>

                <button type="button" className="add-secondary" onClick={() => setInviteOpen(false)}>
                  Fechar
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ParticipantRow({
  tripId,
  member,
  canEdit,
  isCurrentUser,
}: {
  tripId: string;
  member: ParticipantMember;
  canEdit: boolean;
  isCurrentUser: boolean;
}) {
  const [split, setSplit] = useState(
    member.defaultSplitPercentage == null ? "" : String(member.defaultSplitPercentage),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function saveSplit() {
    const parsed = split.trim() === "" ? null : Number(split.replace(",", "."));
    if (parsed != null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 100)) {
      setError("Use um valor entre 0 e 100.");
      return;
    }

    setSaving(true);
    setError("");
    setSaved(false);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("trip_members")
      .update({ default_split_percentage: parsed })
      .eq("id", member.id)
      .eq("trip_id", tripId);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="participant-row">
      <span className="participant-avatar" aria-hidden="true">
        {member.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={member.avatarUrl} alt="" />
        ) : (
          <span>{initials(member.name)}</span>
        )}
      </span>

      <div className="min-w-0 flex-1">
        <strong>
          {member.name}
          {isCurrentUser && <em>Você</em>}
        </strong>
        <small>{member.role === "owner" ? "Responsável pela viagem" : "Participante"}</small>
        {error && <span className="participant-row-error">{error}</span>}
      </div>

      <div className="participant-split">
        <label>
          <span>Divisão padrão</span>
          <div>
            <input
              value={split}
              onChange={(event) => setSplit(event.target.value)}
              inputMode="decimal"
              aria-label={`Divisão padrão de ${member.name}`}
              disabled={!canEdit}
            />
            <b>%</b>
          </div>
        </label>
        {canEdit && (
          <button type="button" onClick={saveSplit} disabled={saving} aria-label={`Salvar divisão de ${member.name}`}>
            {saved ? <Check size={14} /> : saving ? "..." : <UserRound size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}
