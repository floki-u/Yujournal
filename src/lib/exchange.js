import { cacheGet, cachePut } from './database.js';
import { CURRENCIES } from './money.js';
import { addDays, localDate } from './dates.js';
export async function reference(currency, date = localDate(), { force = false } = {}) {
  if (currency === 'CNY') return { rate: 1, rateDate: date };
  const key = `fx:${currency}:${date}`,
    stored = await cacheGet(key);
  if (stored && !force) return stored;
  if (!navigator.onLine) throw Error('该日期没有离线汇率，请联网更新或填写实际人民币结算。');
  const url = new URL('https://api.frankfurter.dev/v2/rates');
  url.search = new URLSearchParams({
    base: currency,
    quotes: 'CNY',
    from: addDays(date, -10),
    to: date,
  });
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok) throw Error('汇率服务暂时不可用，请稍后再试。');
  const rows = await response.json(),
    quote = rows
      .filter(
        (q) =>
          q.base === currency &&
          q.quote === 'CNY' &&
          q.date <= date &&
          Number.isFinite(q.rate) &&
          q.rate > 0,
      )
      .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!quote) throw Error('这个币种或日期暂时没有参考汇率。');
  const result = {
    rate: quote.rate,
    rateDate: quote.date,
    fetchedAt: new Date().toISOString(),
    source: 'Frankfurter',
  };
  await cachePut(key, result);
  return result;
}
export async function latestRates(force = false) {
  const previous = await cacheGet('fx-latest');
  if (!force && previous && Date.now() - new Date(previous.fetchedAt).getTime() < 86400000)
    return previous;
  if (!navigator.onLine) {
    if (previous) return previous;
    throw Error('首次获取参考汇率需要联网。');
  }
  const entries = { ...previous?.entries },
    currencies = Object.keys(CURRENCIES).filter((c) => c !== 'CNY');
  const results = await Promise.allSettled(
    currencies.map((currency) => reference(currency, localDate(), { force })),
  );
  let successes = 0;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      entries[currencies[i]] = r.value;
      successes++;
    }
  });
  if (!successes && !previous) throw Error('汇率服务暂时不可用，请检查网络。');
  const result = { entries, fetchedAt: successes ? new Date().toISOString() : previous.fetchedAt };
  await cachePut('fx-latest', result);
  return result;
}
