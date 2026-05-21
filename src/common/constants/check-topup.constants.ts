/** Precio unitario por check adicional (USD). Mantener alineado con webapp `checkTopup.config.ts`. */
export const CHECK_TOPUP_UNIT_PRICE_USD = 1.67;

export const CHECK_TOPUP_MIN_QUANTITY = 1;

export const CHECK_TOPUP_MAX_QUANTITY = 500;

export function computeChecksTopupTotalUsd(quantity: number): number {
  const q = Math.max(0, Math.floor(Number(quantity)));
  return Math.round(q * CHECK_TOPUP_UNIT_PRICE_USD * 100) / 100;
}

/** Monto enviado a Bold en USD (centavos enteros). */
export function computeChecksTopupBoldAmountCents(quantity: number): number {
  return Math.round(computeChecksTopupTotalUsd(quantity) * 100);
}
