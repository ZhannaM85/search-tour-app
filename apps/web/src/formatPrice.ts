/** Format a user-entered price for display (thin space thousands + ₽). */
export function formatPrice(raw: string): string {
  const digits = parsePriceDigits(raw);
  if (!digits) return raw.trim() ? raw.trim() : "";

  const formatted = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(Number(digits));

  return `${formatted} ₽`;
}

/** Keep only digits from a price field value. */
export function parsePriceDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Format digits for an input (thousands separators, no currency symbol). */
export function formatPriceInput(raw: string): string {
  const digits = parsePriceDigits(raw);
  if (!digits) return "";
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(Number(digits));
}
