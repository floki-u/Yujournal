export const CURRENCIES = {
  CNY: { name: '人民币', digits: 2, symbol: '¥' },
  USD: { name: '美元', digits: 2, symbol: '$' },
  HKD: { name: '港币', digits: 2, symbol: 'HK$' },
  EUR: { name: '欧元', digits: 2, symbol: '€' },
  JPY: { name: '日元', digits: 0, symbol: '¥' },
  GBP: { name: '英镑', digits: 2, symbol: '£' },
  AUD: { name: '澳元', digits: 2, symbol: 'A$' },
  SGD: { name: '新加坡元', digits: 2, symbol: 'S$' },
};
export const MAX_AMOUNT = 1_000_000_000_000;
export function assertAmount(value, { zero = false } = {}) {
  if (!Number.isSafeInteger(value) || value < 0 || (!zero && value === 0) || value > MAX_AMOUNT)
    throw new Error('金额超出有效范围。');
  return value;
}
export function parseAmount(value, currency = 'CNY', { zero = false } = {}) {
  if (!CURRENCIES[currency]) throw new Error('暂不支持这个币种。');
  const text = String(value).trim().replaceAll(',', '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('金额请填写有效数字，最多两位小数。');
  const [whole, decimal = ''] = text.split('.');
  if (CURRENCIES[currency].digits === 0 && Number(decimal) !== 0 && decimal !== '')
    throw new Error('日元金额请使用整数。');
  return assertAmount(Number(whole) * 100 + Number(decimal.padEnd(2, '0')), { zero });
}
export function convertAmount(amount, rate) {
  assertAmount(amount);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1_000_000) throw new Error('缺少有效汇率。');
  return assertAmount(Math.round(amount * rate + Number.EPSILON), { zero: true });
}
export function money(value) {
  return (value / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
export function originalMoney(value, currency) {
  return (value / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: CURRENCIES[currency]?.digits ?? 2,
    maximumFractionDigits: CURRENCIES[currency]?.digits ?? 2,
  });
}
