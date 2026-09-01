import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

function bearerToken(request: Request) {
  const raw = request.headers.get("authorization") || "";
  return raw.toLowerCase().startsWith("bearer ")
    ? raw.slice(7).trim()
    : "";
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return Response.json({ error: "Credencial ausente." }, { status: 401 });
  }

  let body: { expenseId?: unknown };
  try {
    body = await request.json() as { expenseId?: unknown };
  } catch {
    return Response.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const expenseId =
    typeof body.expenseId === "string" && body.expenseId.trim()
      ? body.expenseId.trim()
      : null;

  if (!expenseId) {
    return Response.json({ error: "Despesa não informada." }, { status: 400 });
  }

  const { url, key } = getSupabaseEnv();
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("archive_expense_from_lifeos", {
    p_expense_id: expenseId,
    p_token: token,
  });

  if (error) {
    if (error.code === "42501" || /unauthorized/i.test(error.message || "")) {
      return Response.json({ error: "Credencial inválida." }, { status: 401 });
    }

    return Response.json(
      { error: "Não foi possível arquivar a despesa no Nordestrip." },
      { status: 500 }
    );
  }

  if (data?.status === "conflict") {
    return Response.json(
      {
        error: "Esta despesa não pode ser removida pelo LifeOS.",
        result: data,
      },
      { status: 409 }
    );
  }

  return Response.json({ ok: true, result: data });
}
