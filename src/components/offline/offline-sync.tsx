"use client";

import { useEffect, useState } from "react";

const ACTIVE_TRIP_KEY = "nordestrip:offline:active";

function snapshotKey(tripId: string) {
  return `nordestrip:offline:${tripId}`;
}

function savedTime(tripId: string) {
  try {
    const raw = localStorage.getItem(snapshotKey(tripId));
    if (!raw) return null;
    const data = JSON.parse(raw) as { generatedAt?: unknown };
    return typeof data.generatedAt === "string" ? data.generatedAt : null;
  } catch {
    return null;
  }
}

export function OfflineSync({ tripId }: { tripId: string | null }) {
  const [online, setOnline] = useState(true);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    if (!tripId) return;

    const activeTripId = tripId;
    setLastSavedAt(savedTime(activeTripId));

    let cancelled = false;

    async function registerWorker() {
      if (!("serviceWorker" in navigator)) return;
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch {
        // A ausência de service worker não impede o uso online do app.
      }
    }

    async function sync() {
      if (cancelled || !navigator.onLine) return;

      try {
        const response = await fetch(`/api/offline/snapshot?tripId=${encodeURIComponent(activeTripId)}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok) return;

        const data = await response.json() as { generatedAt?: unknown };
        localStorage.setItem(snapshotKey(activeTripId), JSON.stringify(data));
        localStorage.setItem(ACTIVE_TRIP_KEY, activeTripId);
        if (typeof data.generatedAt === "string") {
          setLastSavedAt(data.generatedAt);
        }
      } catch {
        // Mantém o último pacote válido se a sincronização falhar.
      }
    }

    function updateConnection() {
      const isOnline = navigator.onLine;
      setOnline(isOnline);
      if (isOnline) void sync();
    }

    void registerWorker();
    void sync();

    const timer = window.setInterval(() => void sync(), 15 * 60_000);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, [tripId]);

  if (online) return null;

  const savedLabel = lastSavedAt
    ? new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(lastSavedAt))
    : null;

  return (
    <div
      role="status"
      className="fixed left-1/2 z-[90] -translate-x-1/2 rounded-full bg-petrol px-3 py-2 text-[10px] font-semibold text-white shadow-lg"
      style={{ top: "calc(env(safe-area-inset-top) + 10px)" }}
    >
      Sem conexão{savedLabel ? ` · pacote salvo às ${savedLabel}` : ""}
    </div>
  );
}
