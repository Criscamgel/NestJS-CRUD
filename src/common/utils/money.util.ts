import { DEFAULT_PLAN_CURRENCY } from 'src/common/constants/plan-currency.constants';

export function normalizePlanCurrency(raw?: string | null): string {
  const t = (raw ?? '').trim().toUpperCase();
  return t.length >= 3 ? t : DEFAULT_PLAN_CURRENCY;
}

function localeForCurrency(currency: string): string {
  return currency === 'USD' ? 'en-US' : 'es-CO';
}

/** Etiqueta legible para UI, correos y descripción Bold. */
export function formatMoneyAmount(
  amount: number,
  currency?: string | null,
): string {
  const cur = normalizePlanCurrency(currency);
  const n = Number(amount);
  if (!Number.isFinite(n)) return `— ${cur}`;
  if (cur === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(n);
  }
  return `$${n.toLocaleString(localeForCurrency(cur), {
    maximumFractionDigits: 0,
  })} ${cur}`;
}

export function formatMonthlyPlanPrice(
  monthlyPrice: number,
  currency?: string | null,
): string {
  return `${formatMoneyAmount(monthlyPrice, currency)}/mes`;
}
