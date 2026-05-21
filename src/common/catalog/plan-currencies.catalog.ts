export type PlanCurrencyOption = {
  code: string;
  label: string;
  /** Mínimo documentado o práctico para Bold `total_amount` (unidad entera de la moneda). */
  boldMinTotalAmount: number;
};

/**
 * Monedas soportadas en planes y checkout Bold.
 * Al añadir una moneda, actualizar también `planCurrencies.config.ts` en la webapp.
 */
export const PLAN_CURRENCIES_CATALOG: readonly PlanCurrencyOption[] = [
  { code: 'USD', label: 'Dólar estadounidense (USD)', boldMinTotalAmount: 1 },
  { code: 'COP', label: 'Peso colombiano (COP)', boldMinTotalAmount: 1000 },
  { code: 'EUR', label: 'Euro (EUR)', boldMinTotalAmount: 1 },
  { code: 'MXN', label: 'Peso mexicano (MXN)', boldMinTotalAmount: 10 },
  { code: 'GBP', label: 'Libra esterlina (GBP)', boldMinTotalAmount: 1 },
  { code: 'CAD', label: 'Dólar canadiense (CAD)', boldMinTotalAmount: 1 },
  { code: 'BRL', label: 'Real brasileño (BRL)', boldMinTotalAmount: 1 },
  { code: 'ARS', label: 'Peso argentino (ARS)', boldMinTotalAmount: 100 },
  { code: 'CLP', label: 'Peso chileno (CLP)', boldMinTotalAmount: 1000 },
  { code: 'PEN', label: 'Sol peruano (PEN)', boldMinTotalAmount: 1 },
] as const;

export const PLAN_CURRENCY_CODES: string[] = PLAN_CURRENCIES_CATALOG.map(
  (c) => c.code,
);

export const DEFAULT_PLAN_CURRENCY = 'USD';

export function findPlanCurrency(
  code?: string | null,
): PlanCurrencyOption | undefined {
  const t = (code ?? '').trim().toUpperCase();
  return PLAN_CURRENCIES_CATALOG.find((c) => c.code === t);
}

export function resolvePlanCurrencyCode(raw?: string | null): string {
  const t = (raw ?? '').trim().toUpperCase();
  if (PLAN_CURRENCY_CODES.includes(t)) return t;
  return DEFAULT_PLAN_CURRENCY;
}

export function getBoldMinTotalAmount(currency: string): number {
  return findPlanCurrency(currency)?.boldMinTotalAmount ?? 1;
}
