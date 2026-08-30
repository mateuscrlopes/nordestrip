"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

async function responseMessage(response: Response, fallback: string) {
  try {
    const body = await response.json() as { error?: unknown };
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

type StoredPluggyItem = {
  id: string;
  accountNames: string[];
};

function storedPluggyItems(metadata: unknown, legacyItemId?: string | null) {
  const root =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata as Record<string, unknown>
      : {};
  const rawItems = Array.isArray(root.items) ? root.items : [];
  const items: StoredPluggyItem[] = [];

  for (const value of rawItems) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : null;
    if (!id) continue;
    const accountNames = Array.isArray(record.account_names)
      ? record.account_names.filter((name): name is string => typeof name === "string" && Boolean(name.trim()))
      : [];
    items.push({ id, accountNames });
  }

  if (legacyItemId && !items.some((item) => item.id === legacyItemId)) {
    items.push({ id: legacyItemId, accountNames: [] });
  }

  return items;
}

function itemLabel(item: StoredPluggyItem) {
  if (!item.accountNames.length) return "Meu Pluggy";
  if (item.accountNames.length === 1) return item.accountNames[0];
  return `${item.accountNames[0]} + ${item.accountNames.length - 1}`;
}

function parseItemIds(value: string) {
  return Array.from(new Set(
    value
      .split(/[\s,;]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  )).slice(0, 12);
}

export function PluggyConnectButton({
  tripId,
  itemId,
  status,
  metadata,
}: {
  tripId: string;
  itemId?: string | null;
  status: string;
  metadata?: unknown;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [itemIdsInput, setItemIdsInput] = useState("");
  const [message, setMessage] = useState("");
  const items = useMemo(
    () => storedPluggyItems(metadata, itemId),
    [metadata, itemId]
  );

  function sessionExpired() {
    const next = window.location.pathname + window.location.search;
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  }

  async function syncItem(nextItemId: string) {
    const response = await fetch("/api/integrations/pluggy/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripId, itemId: nextItemId }),
    });

    if (response.status === 401) {
      sessionExpired();
      throw new Error("Sessão expirada.");
    }

    if (!response.ok) {
      throw new Error(await responseMessage(response, "Não foi possível sincronizar esta conexão."));
    }

    return response.json() as Promise<{
      accountsSynced?: number;
      accountNames?: string[];
    }>;
  }

  async function importItems(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const ids = parseItemIds(itemIdsInput);
    if (!ids.length) {
      setMessage("Cole pelo menos um Item ID do Demo da Pluggy.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      let totalAccounts = 0;

      for (let index = 0; index < ids.length; index += 1) {
        setMessage(`Importando conexão ${index + 1} de ${ids.length}...`);
        const result = await syncItem(ids[index]);
        totalAccounts += typeof result.accountsSynced === "number" ? result.accountsSynced : 0;
      }

      setItemIdsInput("");
      setMessage(
        ids.length === 1
          ? `Conexão importada. ${totalAccounts} conta(s) sincronizada(s).`
          : `${ids.length} conexões importadas. ${totalAccounts} conta(s) sincronizada(s).`
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível importar as conexões.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshItem(item: StoredPluggyItem) {
    setBusy(true);
    setMessage("");

    try {
      const result = await syncItem(item.id);
      const count = typeof result.accountsSynced === "number" ? result.accountsSynced : 0;
      setMessage(
        count === 1
          ? "1 conta atualizada."
          : `${count} contas atualizadas.`
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar os dados.");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: StoredPluggyItem) {
    const confirmed = window.confirm(
      `Remover ${itemLabel(item)} apenas do Nordestrip? O Item continuará existindo no Demo da Pluggy.`
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/integrations/pluggy/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, itemId: item.id }),
      });

      if (response.status === 401) {
        sessionExpired();
        return;
      }
      if (!response.ok) {
        throw new Error(await responseMessage(response, "Não foi possível remover a conexão."));
      }

      setMessage("Conexão removida do Nordestrip. O Item da Pluggy foi preservado.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível remover a conexão.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-xl bg-sand/55 px-3 py-3">
        <p className="text-[11px] font-semibold text-petrol">
          Usar conexões do Meu Pluggy
        </p>
        <p className="mt-1 text-[10px] leading-4 text-muted">
          No Demo da sua aplicação Pluggy, copie o Item ID de cada banco já conectado ao Meu Pluggy e cole abaixo. Use um Item por banco.
        </p>

        <form onSubmit={importItems} className="mt-3 space-y-2">
          <textarea
            value={itemIdsInput}
            onChange={(event) => setItemIdsInput(event.target.value)}
            rows={3}
            placeholder={"Item ID do banco 1\nItem ID do banco 2"}
            className="w-full rounded-xl border border-petrol/10 bg-white px-3 py-2 text-[11px] text-ink outline-none focus:border-petrol/30"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-9 items-center justify-center rounded-xl bg-petrol px-3 text-[11px] font-semibold text-white disabled:opacity-55"
          >
            {busy ? "Importando..." : items.length ? "Importar outro Item" : "Importar Item ID"}
          </button>
        </form>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl bg-surface/75 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-petrol">{itemLabel(item)}</p>
              <p className="mt-0.5 break-all text-[9px] text-muted">{item.id}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => refreshItem(item)}
                  className="rounded-lg bg-pale-blue/65 px-2.5 py-1.5 text-[10px] font-semibold text-petrol disabled:opacity-55"
                >
                  Atualizar dados
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removeItem(item)}
                  className="rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-muted disabled:opacity-55"
                >
                  Remover do Nordestrip
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {status === "configured" && items.length === 0 && (
        <p className="text-[10px] leading-4 text-muted">
          As credenciais da Pluggy estão configuradas. Falta apenas importar os Item IDs já existentes no Demo.
        </p>
      )}

      {message && (
        <span role="status" className="block text-[10px] leading-4 text-muted">
          {message}
        </span>
      )}
    </div>
  );
}
