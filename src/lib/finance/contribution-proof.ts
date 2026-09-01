import { CanvasFactory } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";

function parseMoney(raw: string) {
  const normalized = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? Number(value.toFixed(2)) : null;
}

function parseDate(raw: string) {
  const match = raw.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function around(text: string, labels: string[]) {
  const lower = text.toLocaleLowerCase("pt-BR");
  for (const label of labels) {
    const index = lower.indexOf(label);
    if (index >= 0) return text.slice(index, index + 280);
  }
  return text;
}

export async function readContributionProofPdf(buffer: Buffer) {
  let parser: PDFParse | undefined;
  try {
    parser = new PDFParse({ data: buffer, CanvasFactory });
    const result = await parser.getText({ first: 5 });
    const text = String(result?.text || "").replace(/\u00a0/g, " ").slice(0, 120000);

    const valueBlock = around(text, [
      "valor da transferência",
      "valor da transação",
      "valor transferido",
      "valor enviado",
      "valor",
    ]);
    const moneyMatches = valueBlock.match(/R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}|R\$\s*\d+,\d{2}/gi)
      || text.match(/R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}|R\$\s*\d+,\d{2}/gi)
      || [];
    const amount = moneyMatches.map(parseMoney).find((value) => value != null) ?? null;

    const dateBlock = around(text, [
      "data e hora",
      "data da transferência",
      "data da transação",
      "realizado em",
      "data",
    ]);
    const dateMatches = dateBlock.match(/\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/g)
      || text.match(/\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/g)
      || [];
    const date = dateMatches.map(parseDate).find(Boolean) ?? null;

    return {
      amount,
      date,
      status: amount || date ? "partial" : "unreadable",
      charactersRead: text.length,
    };
  } catch (error) {
    return {
      amount: null,
      date: null,
      status: "error",
      charactersRead: 0,
      error: error instanceof Error ? error.message.slice(0, 240) : "Falha ao ler o PDF.",
    };
  } finally {
    try { await parser?.destroy(); } catch {}
  }
}
