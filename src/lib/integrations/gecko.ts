const GECKO_API_URL = "https://api.geckoapi.com.br/v1/extract";

export type GeckoBusResult = {
  externalId: string;
  departureAt: string | null;
  arrivalAt: string | null;
  durationMinutes: number | null;
  durationText: string | null;
  operator: string | null;
  serviceClass: string | null;
  originTerminalName: string | null;
  originTerminalAddress: string | null;
  destinationTerminalName: string | null;
  destinationTerminalAddress: string | null;
  pricePerPassenger: number | null;
  originalPricePerPassenger: number | null;
  currency: string;
  seatsAvailable: number | null;
  sourceUrl: string | null;
  features: Record<string, unknown>;
  rawPayload: Record<string, unknown>;
};

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function integerValue(value: unknown) {
  const number = numberValue(value);
  return number == null ? null : Math.max(0, Math.round(number));
}

function safeUrl(value: unknown) {
  const text = textValue(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function isoDateTime(value: unknown) {
  const text = textValue(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function durationBetween(departureAt: string | null, arrivalAt: string | null) {
  if (!departureAt || !arrivalAt) return null;
  const milliseconds = new Date(arrivalAt).getTime() - new Date(departureAt).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  return Math.round(milliseconds / 60_000);
}

function normalizeItem(value: unknown, requestUrl: string | null): GeckoBusResult | null {
  const item = recordValue(value);
  if (!item) return null;

  const externalId = textValue(item.id) || textValue(item.externalId);
  if (!externalId) return null;

  const departure = recordValue(item.departure);
  const arrival = recordValue(item.arrival);
  const departurePlace = recordValue(departure?.place);
  const arrivalPlace = recordValue(arrival?.place);
  const travelCompany = recordValue(item.travelCompany);
  const serviceClassRecord = recordValue(item.serviceClass);

  const departureAt = isoDateTime(departure?.dateTime);
  const arrivalAt = isoDateTime(arrival?.dateTime);

  const price = numberValue(item.price);
  const discountedPrice = numberValue(item.discountedPrice);
  const effectivePrice =
    discountedPrice != null && (price == null || discountedPrice <= price)
      ? discountedPrice
      : price;

  const busFeatures = Array.isArray(item.busFeatures)
    ? item.busFeatures.filter((feature) => typeof feature === "string")
    : [];

  return {
    externalId,
    departureAt,
    arrivalAt,
    durationMinutes: durationBetween(departureAt, arrivalAt),
    durationText: textValue(item.durationText),
    operator: textValue(travelCompany?.name) || textValue(item.operator),
    serviceClass:
      textValue(serviceClassRecord?.name) ||
      textValue(item.serviceClassName) ||
      textValue(item.serviceClass),
    originTerminalName: textValue(departurePlace?.terminal),
    originTerminalAddress: textValue(departurePlace?.terminalAddress),
    destinationTerminalName: textValue(arrivalPlace?.terminal),
    destinationTerminalAddress: textValue(arrivalPlace?.terminalAddress),
    pricePerPassenger: effectivePrice,
    originalPricePerPassenger: price,
    currency: textValue(item.currency) || "BRL",
    seatsAvailable: integerValue(item.availableSeats),
    sourceUrl: requestUrl,
    features: {
      bus_features: busFeatures,
      seat_recline_degrees: numberValue(item.seatReclineDegrees),
      electronic_boarding_pass: item.hasElectronicBoardingPass === true,
      low_fare: item.isLowFare === true,
      pricing_basis: "per_passenger",
    },
    rawPayload: item,
  };
}

export function isGeckoConfigured() {
  return Boolean(process.env.GECKOAPI_API_KEY);
}

export async function searchGeckoClickBus(options: {
  originCity: string;
  originState: string;
  destinationCity: string;
  destinationState: string;
  departureDate: string;
  page?: number;
}) {
  const apiKey = process.env.GECKOAPI_API_KEY;
  if (!apiKey) throw new Error("gecko-not-configured");

  const response = await fetch(GECKO_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      target: "clickbus.com.br",
      type: "plp",
      originCity: options.originCity,
      originState: options.originState,
      destinationCity: options.destinationCity,
      destinationState: options.destinationState,
      departureDate: options.departureDate,
      page: options.page || 1,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("gecko-auth-failed");
  }
  if (response.status === 402) {
    throw new Error("gecko-credits-empty");
  }
  if (response.status === 429) {
    throw new Error("gecko-rate-limited");
  }
  if (!response.ok) {
    throw new Error(`gecko-search-${response.status}`);
  }

  const payload = await response.json() as unknown;
  const root = recordValue(payload);
  const data = recordValue(root?.data);
  const notFound = root?.notFound === true || data?.notFound === true;
  if (notFound) return [];

  const requestUrl = safeUrl(data?.requestUrl) || safeUrl(data?.url);
  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(root?.items)
      ? root.items
      : [];

  const results: GeckoBusResult[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const normalized = normalizeItem(item, requestUrl);
    if (!normalized || seen.has(normalized.externalId)) continue;
    seen.add(normalized.externalId);
    results.push(normalized);
    if (results.length >= 20) break;
  }

  return results;
}

export function parseClientBusResult(value: unknown): GeckoBusResult | null {
  const record = recordValue(value);
  if (!record) return null;

  const externalId = textValue(record.externalId);
  if (!externalId) return null;

  const features = recordValue(record.features) || {};
  const rawPayload = recordValue(record.rawPayload) || {};
  const departureAt = isoDateTime(record.departureAt);
  const arrivalAt = isoDateTime(record.arrivalAt);

  return {
    externalId,
    departureAt,
    arrivalAt,
    durationMinutes:
      integerValue(record.durationMinutes) ??
      durationBetween(departureAt, arrivalAt),
    durationText: textValue(record.durationText),
    operator: textValue(record.operator),
    serviceClass: textValue(record.serviceClass),
    originTerminalName: textValue(record.originTerminalName),
    originTerminalAddress: textValue(record.originTerminalAddress),
    destinationTerminalName: textValue(record.destinationTerminalName),
    destinationTerminalAddress: textValue(record.destinationTerminalAddress),
    pricePerPassenger: numberValue(record.pricePerPassenger),
    originalPricePerPassenger: numberValue(record.originalPricePerPassenger),
    currency: textValue(record.currency) || "BRL",
    seatsAvailable: integerValue(record.seatsAvailable),
    sourceUrl: safeUrl(record.sourceUrl),
    features,
    rawPayload,
  };
}
