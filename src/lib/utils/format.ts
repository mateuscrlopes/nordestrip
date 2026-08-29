export const formatDate = (value?: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(`${value}T12:00:00`)) : null;
export const formatDateTime = (value?: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : null;
export const formatMoney = (value?: number | null) => value == null ? null : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
export const valueText = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
