import { listPluggyAccounts, normalizePluggyAccount, PluggyApiError } from "@/lib/integrations/pluggy";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RequestBody = {
  tripId?: unknown;
  itemId?: unknown;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Não autorizado." }, { status: 401 });

  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return Response.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const tripId = typeof body.tripId === "string" ? body.tripId : "";
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  if (!tripId || !itemId) {
    return Response.json({ error: "Viagem e conexão são obrigatórias." }, { status: 400 });
  }

  const membership = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership.error || !membership.data) {
    return Response.json({ error: "Acesso negado para esta viagem." }, { status: 403 });
  }

  try {
    const accounts = await listPluggyAccounts(itemId);
    let synced = 0;

    for (const rawAccount of accounts) {
      const account = normalizePluggyAccount(rawAccount);
      if (!account) continue;

      const saved = await supabase
        .from("financial_accounts")
        .upsert({
          owner_user_id: user.id,
          provider: "pluggy",
          external_id: account.externalId,
          display_name: account.displayName,
          account_type: account.accountType,
          currency: account.currency,
          current_balance: account.currentBalance,
          credit_limit: account.creditLimit,
          automatically_invested_balance: account.automaticallyInvestedBalance,
          metadata: account.metadata,
          last_synced_at: new Date().toISOString(),
          archived_at: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "provider,external_id" })
        .select("id")
        .single();

      if (saved.error || !saved.data) {
        throw new Error("Não foi possível salvar uma das contas conectadas.");
      }

      const linked = await supabase
        .from("trip_financial_accounts")
        .upsert({
          trip_id: tripId,
          financial_account_id: saved.data.id,
          purpose: account.purpose,
          include_balance_in_available: false,
          archived_at: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "trip_id,financial_account_id,purpose" });

      if (linked.error) {
        throw new Error("Não foi possível vincular uma das contas à viagem.");
      }

      synced += 1;
    }

    const now = new Date().toISOString();
    const connection = await supabase
      .from("integration_connections")
      .update({
        status: "connected",
        external_connection_id: itemId,
        last_sync_at: now,
        last_success_at: now,
        last_error_at: null,
        last_error_message: null,
        metadata: {
          account_count: synced,
          balance_source: "pluggy",
        },
        updated_at: now,
      })
      .eq("trip_id", tripId)
      .eq("provider", "pluggy")
      .eq("purpose", "open_finance");

    if (connection.error) {
      throw new Error("Não foi possível atualizar o status da integração.");
    }

    return Response.json({ synced });
  } catch (error) {
    const status = error instanceof PluggyApiError ? error.status : 500;
    const message = error instanceof PluggyApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Não foi possível sincronizar a conta.";

    await supabase
      .from("integration_connections")
      .update({
        status: "needs_attention",
        last_error_at: new Date().toISOString(),
        last_error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("trip_id", tripId)
      .eq("provider", "pluggy")
      .eq("purpose", "open_finance");

    return Response.json({ error: message }, { status });
  }
}
