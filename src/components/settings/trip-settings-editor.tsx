"use client";

import { createClient } from "@/lib/supabase/client";
import type { TripFinanceSettings, TripPreferences } from "@/types/trip";
import { Save } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const defaultPreferences: Omit<TripPreferences, "trip_id"> = {
  pace: "balanced",
  anchor_buffer_minutes: 15,
  terminal_buffer_minutes: 45,
  airport_buffer_minutes: 120,
  wake_prep_minutes: 60,
  suggest_wake_time: true,
  route_reorder_mode: "suggest",
  live_location_enabled: true,
  api_refresh_mode: "manual_when_stale",
  offline_essential_data: true,
  extra: {},
};

const defaultFinance: Omit<TripFinanceSettings, "trip_id"> = {
  total_budget: null,
  protected_reserve: 0,
  discovery_budget: 0,
  currency: "BRL",
};

function numberValue(form: FormData, name: string, fallback = 0) {
  const raw = String(form.get(name) ?? "").trim().replace(",", ".");
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(form: FormData, name: string) {
  const raw = String(form.get(name) ?? "").trim().replace(",", ".");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function TripSettingsEditor({
  tripId,
  preferences,
  finance,
}: {
  tripId: string;
  preferences: TripPreferences | null;
  finance: TripFinanceSettings | null;
}) {
  const router = useRouter();
  const currentPreferences = preferences || ({ trip_id: tripId, ...defaultPreferences } as TripPreferences);
  const currentFinance = finance || ({ trip_id: tripId, ...defaultFinance } as TripFinanceSettings);

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const payloadPreferences = {
      trip_id: tripId,
      pace: String(form.get("pace") || "balanced"),
      anchor_buffer_minutes: numberValue(form, "anchor_buffer_minutes", 15),
      terminal_buffer_minutes: numberValue(form, "terminal_buffer_minutes", 45),
      airport_buffer_minutes: numberValue(form, "airport_buffer_minutes", 120),
      wake_prep_minutes: numberValue(form, "wake_prep_minutes", 60),
      suggest_wake_time: form.get("suggest_wake_time") === "on",
      route_reorder_mode: String(form.get("route_reorder_mode") || "suggest"),
      live_location_enabled: form.get("live_location_enabled") === "on",
      api_refresh_mode: String(form.get("api_refresh_mode") || "manual_when_stale"),
      offline_essential_data: form.get("offline_essential_data") === "on",
      extra: currentPreferences.extra || {},
      updated_at: new Date().toISOString(),
    };

    const totalBudget = optionalNumber(form, "total_budget");
    const protectedReserve = numberValue(form, "protected_reserve", 0);
    const discoveryBudget = numberValue(form, "discovery_budget", 0);

    if ([protectedReserve, discoveryBudget].some((value) => value < 0) || (totalBudget != null && totalBudget < 0)) {
      setError("Os valores financeiros não podem ser negativos.");
      return;
    }

    const payloadFinance = {
      trip_id: tripId,
      total_budget: totalBudget,
      protected_reserve: protectedReserve,
      discovery_budget: discoveryBudget,
      currency: "BRL",
      updated_at: new Date().toISOString(),
    };

    setSaving(true);
    setError("");
    setNotice("");
    const supabase = createClient();

    const [preferencesResult, financeResult] = await Promise.all([
      supabase.from("trip_preferences").upsert(payloadPreferences, { onConflict: "trip_id" }),
      supabase.from("trip_finance_settings").upsert(payloadFinance, { onConflict: "trip_id" }),
    ]);

    const saveError = preferencesResult.error || financeResult.error;
    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setNotice("Configurações salvas");
    router.refresh();
    window.setTimeout(() => setNotice(""), 1800);
  }

  return (
    <form onSubmit={submit} className="trip-settings-form">
      <section className="trip-settings-section">
        <div>
          <strong>Ritmo da viagem</strong>
          <span>Define o quanto o planejador pode concentrar atividades no mesmo dia.</span>
        </div>
        <select name="pace" defaultValue={currentPreferences.pace}>
          <option value="relaxed">Leve</option>
          <option value="balanced">Equilibrado</option>
          <option value="full">Intenso</option>
        </select>
      </section>

      <section className="trip-settings-section trip-settings-grid">
        <label>
          <span>Folga entre atividades fixas</span>
          <input name="anchor_buffer_minutes" type="number" min="0" defaultValue={currentPreferences.anchor_buffer_minutes} />
          <small>minutos</small>
        </label>
        <label>
          <span>Chegada antecipada ao terminal</span>
          <input name="terminal_buffer_minutes" type="number" min="0" defaultValue={currentPreferences.terminal_buffer_minutes} />
          <small>minutos</small>
        </label>
        <label>
          <span>Chegada antecipada ao aeroporto</span>
          <input name="airport_buffer_minutes" type="number" min="0" defaultValue={currentPreferences.airport_buffer_minutes} />
          <small>minutos</small>
        </label>
        <label>
          <span>Tempo para acordar e se preparar</span>
          <input name="wake_prep_minutes" type="number" min="0" defaultValue={currentPreferences.wake_prep_minutes} />
          <small>minutos</small>
        </label>
      </section>

      <section className="trip-settings-section">
        <div>
          <strong>Reorganização do roteiro</strong>
          <span>Controla quando o Nordestrip pode sugerir mudanças na ordem das atividades.</span>
        </div>
        <select name="route_reorder_mode" defaultValue={currentPreferences.route_reorder_mode}>
          <option value="never">Nunca sugerir</option>
          <option value="suggest">Sugerir quando fizer sentido</option>
          <option value="flexible_only">Somente itens flexíveis</option>
        </select>
      </section>

      <section className="trip-settings-section">
        <div>
          <strong>Atualização de integrações</strong>
          <span>Define quando dados externos podem ser atualizados.</span>
        </div>
        <select name="api_refresh_mode" defaultValue={currentPreferences.api_refresh_mode}>
          <option value="manual">Somente manual</option>
          <option value="manual_when_stale">Manual quando estiver desatualizado</option>
          <option value="automatic">Automática</option>
        </select>
      </section>

      <section className="trip-settings-toggles">
        <label>
          <input name="suggest_wake_time" type="checkbox" defaultChecked={currentPreferences.suggest_wake_time} />
          <span>
            <strong>Sugerir horário de acordar</strong>
            <small>Usa deslocamentos e compromissos fixos como referência.</small>
          </span>
        </label>
        <label>
          <input name="live_location_enabled" type="checkbox" defaultChecked={currentPreferences.live_location_enabled} />
          <span>
            <strong>Permitir localização ao vivo</strong>
            <small>Só funciona enquanto o app estiver aberto e com permissão do aparelho.</small>
          </span>
        </label>
        <label>
          <input name="offline_essential_data" type="checkbox" defaultChecked={currentPreferences.offline_essential_data} />
          <span>
            <strong>Preparar dados essenciais para uso sem internet</strong>
            <small>Endereços, ordem do roteiro e informações operacionais prioritárias.</small>
          </span>
        </label>
      </section>

      <section className="trip-settings-finance">
        <div className="trip-settings-finance-heading">
          <strong>Planejamento financeiro</strong>
          <span>Esses valores alimentam a leitura da tela Dinheiro.</span>
        </div>
        <div className="trip-settings-grid">
          <label>
            <span>Orçamento total</span>
            <input name="total_budget" inputMode="decimal" defaultValue={currentFinance.total_budget ?? ""} placeholder="0,00" />
            <small>R$</small>
          </label>
          <label>
            <span>Reserva protegida</span>
            <input name="protected_reserve" inputMode="decimal" defaultValue={currentFinance.protected_reserve} placeholder="0,00" />
            <small>R$</small>
          </label>
          <label>
            <span>Margem para descobertas</span>
            <input name="discovery_budget" inputMode="decimal" defaultValue={currentFinance.discovery_budget} placeholder="0,00" />
            <small>R$</small>
          </label>
        </div>
      </section>

      {error && <p className="add-error" role="alert">{error}</p>}
      {notice && <p className="trip-settings-notice" role="status">{notice}</p>}

      <button type="submit" className="trip-settings-save" disabled={saving}>
        <Save size={15} />
        {saving ? "Salvando..." : "Salvar configurações"}
      </button>
    </form>
  );
}
