/** Precio unitario por check adicional (USD). Mantener alineado con webapp `checkTopup.config.ts`. */
export const CHECK_TOPUP_UNIT_PRICE_USD = 1.67;

export const CHECK_TOPUP_MIN_QUANTITY = 1;

export const CHECK_TOPUP_MAX_QUANTITY = 500;

/** Subtotal exacto (2 decimales) para mostrar en UI. */
export function computeChecksTopupSubtotalUsd(quantity: number): number {
  const q = Math.max(0, Math.floor(Number(quantity)));
  return Math.round(q * CHECK_TOPUP_UNIT_PRICE_USD * 100) / 100;
}

/** Monto en USD (dólares con decimales) para Bold `total_amount` — no usar centavos. */
export function computeChecksTopupBoldAmountUsd(quantity: number): number {
  return computeChecksTopupSubtotalUsd(quantity);
}
