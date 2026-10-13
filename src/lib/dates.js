const pad = (n) => String(n).padStart(2, '0');
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (y < 1900 || y > 2100) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
export function assertDate(value) {
  if (!validDate(value)) throw new Error('请选择有效日期。');
  return value;
}
export function addDays(value, n) {
  assertDate(value);
  const date = new Date(value + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + n);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
export function monthDay(year, month, day) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(Math.min(day, last))}`;
}
export function nextOccurrence(template, from = template.startDate) {
  assertDate(from);
  const start = template.startDate;
  const [sy, sm, sd] = start.split('-').map(Number),
    interval = template.interval || 1;
  let result;
  if (template.frequency === 'weekly') {
    const gap = Math.ceil(
      (new Date(from + 'T12:00:00Z') - new Date(start + 'T12:00:00Z')) / (86400000 * 7 * interval),
    );
    result = addDays(start, Math.max(0, gap) * 7 * interval);
  } else if (template.frequency === 'yearly') {
    const year = Number(from.slice(0, 4));
    let step = Math.max(0, Math.floor((year - sy) / interval));
    result = monthDay(sy + step * interval, sm, template.day || sd);
    if (result < from) result = monthDay(sy + (step + 1) * interval, sm, template.day || sd);
  } else {
    const [fy, fm] = from.split('-').map(Number);
    let step = Math.max(0, Math.floor(((fy - sy) * 12 + fm - sm) / interval));
    const get = (n) => {
      const index = sy * 12 + sm - 1 + n * interval;
      return monthDay(Math.floor(index / 12), (index % 12) + 1, template.day || sd);
    };
    result = get(step);
    if (result < from) result = get(step + 1);
  }
  if (result < start) return nextOccurrence(template, start);
  return result;
}
export function advanceOccurrence(template, date) {
  return nextOccurrence(template, addDays(date, 1));
}
export function period(date, mode) {
  assertDate(date);
  const [y, m] = date.split('-').map(Number);
  return {
    prefix: mode === 'year' ? date.slice(0, 4) : mode === 'month' ? date.slice(0, 7) : date,
    start: mode === 'year' ? `${y}-01-01` : mode === 'month' ? `${y}-${pad(m)}-01` : date,
    end: mode === 'year' ? `${y}-12-31` : mode === 'month' ? monthDay(y, m, 31) : date,
    label:
      mode === 'year'
        ? `${y} 年`
        : mode === 'month'
          ? `${y} 年 ${m} 月`
          : `${y} 年 ${m} 月 ${Number(date.slice(8))} 日`,
  };
}
