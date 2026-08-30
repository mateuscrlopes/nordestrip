const SCRAPPA_API_URL = "https://scrappa.co/api";

export type ScrappaAccommodationResult = {
  externalId: string | null;
  name: string;
  sourceUrl: string | null;
  priceLabel: string | null;
  totalAmount: number | null;
  currency: string;
  reviewScore: number | null;
  reviewCount: number | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  rawPayload: Record<string, unknown>;
};

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function pathValue(source: Record<string, unknown>, path: string) {
  let current: unknown = source;
  for (const part of path.split(".")) {
    const record = recordValue(current);
    if (!record) return null;
    current = record[part];
  }
  return current ?? null;
}

function firstValue(source: Record<string, unknown>, paths: string[]) {
  for (const path of paths) {
    const value = pathValue(source, path);
    if (value != null && value !== "") return value;
  }
  return null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function idValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return stringValue(value);
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/\s/g, "");
    if (/^-?\d+(?:[.,]\d+)?$/.test(trimmed)) {
      const parsed = Number(trimmed.replace(",", "."));
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  return null;
}

function moneyValue(value: unknown) {
  const direct = numberValue(value);
  if (direct != null) return direct;

  const record = recordValue(value);
  if (record) {
    return numberValue(firstValue(record, ["amount", "value", "total", "price"]));
  }

  if (typeof value !== "string") return null;
  const match = value.match(/(?:R\$|BRL)\s*([\d.]+(?:,\d{1,2})?)/i);
  if (!match?.[1]) return null;

  const normalized = match[1].replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeUrl(value: unknown) {
  const text = stringValue(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeResult(raw: Record<string, unknown>): ScrappaAccommodationResult | null {
  const name = stringValue(firstValue(raw, [
    "name",
    "title",
    "hotel_name",
    "hotelName",
    "property_name",
    "propertyName",
  ]));
  if (!name) return null;

  const sourceUrl = safeUrl(firstValue(raw, [
    "url",
    "link",
    "property_url",
    "propertyUrl",
    "booking_url",
    "bookingUrl",
  ]));

  const rawPrice = firstValue(raw, [
    "price",
    "total_price",
    "totalPrice",
    "price_text",
    "priceText",
    "price_display",
    "priceDisplay",
    "price.amount",
    "price.value",
  ]);

  const priceLabel =
    typeof rawPrice === "string"
      ? rawPrice.trim() || null
      : stringValue(firstValue(raw, ["price.formatted", "price.label", "price.text"]));

  const address = stringValue(firstValue(raw, [
    "address",
    "location",
    "location.name",
    "location.address",
    "district",
  ]));

  const externalId = idValue(firstValue(raw, [
    "id",
    "hotel_id",
    "hotelId",
    "property_id",
    "propertyId",
  ])) || sourceUrl;

  const reviewScore = numberValue(firstValue(raw, [
    "review_score",
    "reviewScore",
    "rating",
    "score",
    "review.score",
  ]));

  const reviewCountRaw = numberValue(firstValue(raw, [
    "review_count",
    "reviewCount",
    "reviews_count",
    "reviewsCount",
  ]));

  return {
    externalId,
    name,
    sourceUrl,
    priceLabel,
    totalAmount: moneyValue(rawPrice),
    currency: stringValue(firstValue(raw, ["currency", "price.currency"])) || "BRL",
    reviewScore,
    reviewCount: reviewCountRaw == null ? null : Math.max(0, Math.round(reviewCountRaw)),
    address,
    latitude: numberValue(firstValue(raw, ["latitude", "lat", "location.latitude", "location.lat"])),
    longitude: numberValue(firstValue(raw, ["longitude", "lng", "lon", "location.longitude", "location.lng"])),
    imageUrl: safeUrl(firstValue(raw, ["image", "image_url", "imageUrl", "photo", "thumbnail"])),
    rawPayload: raw,
  };
}

export function normalizeScrappaSearchResponse(payload: unknown) {
  const root = recordValue(payload);
  const data = root ? recordValue(root.data) : null;
  const rawResults = Array.isArray(data?.results)
    ? data.results
    : Array.isArray(root?.results)
      ? root.results
      : [];

  const seen = new Set<string>();
  const results: ScrappaAccommodationResult[] = [];

  for (const value of rawResults) {
    const raw = recordValue(value);
    if (!raw) continue;
    const normalized = normalizeResult(raw);
    if (!normalized) continue;

    const key = normalized.externalId || normalized.sourceUrl || `${normalized.name}|${normalized.address || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(normalized);

    if (results.length >= 15) break;
  }

  return results;
}

export function parseClientAccommodationResult(value: unknown): ScrappaAccommodationResult | null {
  const raw = recordValue(value);
  if (!raw) return null;

  const name = stringValue(raw.name);
  if (!name) return null;

  const rawPayload = recordValue(raw.rawPayload) || {};
  const reviewCountRaw = numberValue(raw.reviewCount);

  return {
    externalId: idValue(raw.externalId),
    name,
    sourceUrl: safeUrl(raw.sourceUrl),
    priceLabel: stringValue(raw.priceLabel),
    totalAmount: moneyValue(raw.totalAmount),
    currency: stringValue(raw.currency) || "BRL",
    reviewScore: numberValue(raw.reviewScore),
    reviewCount: reviewCountRaw == null ? null : Math.max(0, Math.round(reviewCountRaw)),
    address: stringValue(raw.address),
    latitude: numberValue(raw.latitude),
    longitude: numberValue(raw.longitude),
    imageUrl: safeUrl(raw.imageUrl),
    rawPayload,
  };
}

export function isScrappaConfigured() {
  return Boolean(process.env.SCRAPPA_API_KEY);
}

export async function searchScrappaBooking(options: {
  destination: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  rooms: number;
}) {
  const apiKey = process.env.SCRAPPA_API_KEY;
  if (!apiKey) throw new Error("scrappa-not-configured");

  const params = new URLSearchParams({
    ss: options.destination,
    checkin: options.checkIn,
    checkout: options.checkOut,
    group_adults: String(options.adults),
    no_rooms: String(options.rooms),
    lang: "pt-br",
    currency: "BRL",
  });

  const response = await fetch(`${SCRAPPA_API_URL}/booking/search?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "X-API-KEY": apiKey,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("scrappa-auth-failed");
  }
  if (response.status === 429) {
    throw new Error("scrappa-rate-limited");
  }
  if (!response.ok) {
    throw new Error(`scrappa-search-${response.status}`);
  }

  const payload = await response.json() as unknown;
  return normalizeScrappaSearchResponse(payload);
}
