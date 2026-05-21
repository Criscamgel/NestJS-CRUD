import {
  DEFAULT_PLAN_CURRENCY,
  findPlanCurrency,
  resolvePlanCurrencyCode,
} from 'src/common/catalog/plan-currencies.catalog';

export function normalizePlanCurrency(raw?: string | null): string {
  return resolvePlanCurrencyCode(raw);
}

function intlLocaleForCurrency(code: string): string {
  const map: Record<string, string> = {
    USD: 'en-US',
    COP: 'es-CO',
    EUR: 'es-ES',
    MXN: 'es-MX',
    GBP: 'en-GB',
    CAD: 'en-CA',
    BRL: 'pt-BR',
    ARS: 'es-AR',
    CLP: 'es-CL',
    PEN: 'es-PE',
  };
  return map[code] ?? 'en-US';
}

/** Etiqueta legible para UI, correos y descripción Bold (montos enteros). */
export function formatMoneyAmount(
  amount: number,
  currency?: string | null,
): string {
  return formatMoneyAmountPrecise(amount, currency, 0);
}

/** Montos con decimales (p. ej. top-up de checks en USD). */
export function formatMoneyAmountPrecise(
  amount: number,
  currency?: string | null,
  fractionDigits = 2,
): string {
  const cur = normalizePlanCurrency(currency);
  const n = Number(amount);
  if (!Number.isFinite(n)) return `— ${cur}`;
  if (findPlanCurrency(cur)) {
    try {
      return new Intl.NumberFormat(intlLocaleForCurrency(cur), {
        style: 'currency',
        currency: cur,
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(n);
    } catch {
      /* fallback abajo */
    }
  }
  return `${n.toLocaleString(intlLocaleForCurrency(cur), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })} ${cur}`;
}

export function formatMonthlyPlanPrice(
  monthlyPrice: number,
  currency?: string | null,
): string {
  return `${formatMoneyAmount(monthlyPrice, currency)}/mes`;
}

export { DEFAULT_PLAN_CURRENCY };
