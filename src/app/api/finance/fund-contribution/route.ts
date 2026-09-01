import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg"]);

function safeName(value: string, mime: string) {
  const extension = mime === "application/pdf" ? ".pdf" : mime === "image/png" ? ".png" : ".jpg";
  const base = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/\.(pdf|png|jpe?g)$/i, "")
    .slice(0, 120);
  return (base || "comprovante") + extension;
}

function dateDistanceDays(a: string | null, b: string | null) {
  if (!a || !b) return 0;
  const left = new Date(a.slice(0, 10) + "T12:00:00Z").getTime();
  const right = new Date(b.slice(0, 10) + "T12:00:00Z").getTime();
  return Math.abs(left - right) / 86400000;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return Response.json({ error: "Não autorizado." }, { status: 401 });

  const form = await request.formData();
  const tripId = String(form.get("tripId") || "").trim();
  const contributorUserId = String(form.get("contributorUserId") || user.id).trim();
  const informedAmountRaw = String(form.get("amount") || "").replace(",", ".");
  const informedAmount = informedAmountRaw ? Number(informedAmountRaw) : null;
  const informedDate = String(form.get("date") || "").trim() || null;
  const file = form.get("file");

  if (!tripId || !(file instanceof File)) {
    return Response.json({ error: "Viagem e comprovante são obrigatórios." }, { status: 400 });
  }

  if (!ALLOWED.has(file.type) || file.size <= 0 || file.size > MAX_BYTES) {
    return Response.json({ error: "Envie PDF, PNG ou JPG de até 12 MB." }, { status: 415 });
  }

  const membership = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membership.error || !membership.data) {
    return Response.json({ error: "Você não participa desta viagem." }, { status: 403 });
  }

  const contributor = await supabase
    .from("trip_members")
    .select("id")
    .eq("trip_id", tripId)
    .eq("user_id", contributorUserId)
    .maybeSingle();
  if (contributor.error || !contributor.data) {
    return Response.json({ error: "O responsável pelo aporte não participa da viagem." }, { status: 400 });
  }

  const fundLink = await supabase
    .from("trip_financial_accounts")
    .select("financial_account_id")
    .eq("trip_id", tripId)
    .eq("purpose", "trip_fund")
    .eq("include_balance_in_available", true)
    .is("archived_at", null)
    .limit(1);
  const fundAccountId = fundLink.data?.[0]?.financial_account_id;
  if (fundLink.error || !fundAccountId) {
    return Response.json({ error: "O Fundo da Viagem ainda não está configurado." }, { status: 409 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extraction = {
    amount: informedAmount != null && Number.isFinite(informedAmount) && informedAmount > 0
      ? Number(informedAmount.toFixed(2))
      : null,
    date: informedDate,
    status: "manual",
  };

  const amount = extraction.amount;

  if (amount == null) {
    return Response.json(
      { error: "Informe o valor do aporte para continuar.", extraction },
      { status: 422 }
    );
  }

  const path = [
    tripId,
    contributorUserId,
    crypto.randomUUID(),
    safeName(file.name, file.type),
  ].join("/");

  const upload = await supabase.storage
    .from("trip-fund-receipts")
    .upload(path, buffer, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

  if (upload.error) {
    return Response.json({ error: "Não foi possível guardar o comprovante." }, { status: 500 });
  }

  const credits = await supabase
    .from("financial_transactions")
    .select("id,amount,occurred_at,external_id")
    .eq("trip_id", tripId)
    .eq("financial_account_id", fundAccountId)
    .eq("direction", "credit")
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .limit(60);

  if (credits.error) {
    await supabase.storage.from("trip-fund-receipts").remove([path]);
    return Response.json({ error: "Não foi possível procurar a entrada no Mercado Pago." }, { status: 500 });
  }

  const existing = await supabase
    .from("trip_fund_contributions")
    .select("financial_transaction_id")
    .eq("trip_id", tripId)
    .not("financial_transaction_id", "is", null);
  const used = new Set((existing.data ?? []).map((row) => row.financial_transaction_id));

  const candidates = (credits.data ?? [])
    .filter((row) => !used.has(row.id))
    .filter((row) => Math.abs(Math.abs(Number(row.amount || 0)) - amount) <= 0.01)
    .map((row) => ({
      ...row,
      distance: dateDistanceDays(informedDate, row.occurred_at),
    }))
    .filter((row) => !informedDate || row.distance <= 3)
    .sort((a, b) => a.distance - b.distance);

  const matched = candidates.length === 1
    ? candidates[0]
    : candidates.length > 1 && candidates[0].distance < candidates[1].distance
      ? candidates[0]
      : null;

  if (matched) {
    const assign = await supabase.rpc("assign_trip_fund_contribution", {
      p_transaction_id: matched.id,
      p_user_id: contributorUserId,
    });

    if (assign.error) {
      await supabase.storage.from("trip-fund-receipts").remove([path]);
      return Response.json({ error: "A entrada foi encontrada, mas não consegui atribuí-la." }, { status: 500 });
    }

    const contributionId = assign.data as string;
    const update = await supabase
      .from("trip_fund_contributions")
      .update({
        receipt_path: path,
        receipt_filename: file.name,
        receipt_mime: file.type,
        extracted_data: {
          ...extraction,
          informed_amount: informedAmount,
          matched_transaction_id: matched.id,
        },
        source: "receipt",
        updated_at: new Date().toISOString(),
      })
      .eq("id", contributionId);

    if (update.error) {
      return Response.json({
        matched: true,
        contributionId,
        extraction,
        warning: "O aporte foi atribuído, mas o comprovante não ficou vinculado ao registro.",
      });
    }

    return Response.json({
      matched: true,
      contributionId,
      transactionId: matched.id,
      amount,
      extraction,
    });
  }

  const pending = await supabase
    .from("trip_fund_contributions")
    .insert({
      trip_id: tripId,
      user_id: contributorUserId,
      amount,
      contribution_at: informedDate
        ? new Date(informedDate + "T12:00:00-03:00").toISOString()
        : new Date().toISOString(),
      status: "pending_match",
      source: "receipt",
      receipt_path: path,
      receipt_filename: file.name,
      receipt_mime: file.type,
      extracted_data: {
        ...extraction,
        informed_amount: informedAmount,
        candidate_count: candidates.length,
      },
      created_by: user.id,
    })
    .select("id")
    .single();

  if (pending.error || !pending.data) {
    await supabase.storage.from("trip-fund-receipts").remove([path]);
    return Response.json({ error: "Não foi possível registrar o aporte para conciliação." }, { status: 500 });
  }

  return Response.json({
    matched: false,
    contributionId: pending.data.id,
    amount,
    extraction,
    message: "Comprovante guardado. A entrada será conciliada quando aparecer no Mercado Pago.",
  });
}
