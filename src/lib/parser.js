import { localDate, addDays, validDate } from './dates.js';
import { parseAmount } from './money.js';
const CN = '零〇一二两三四五六七八九十百千万亿点元块毛角分';
const chineseDigits = '零一二三四五六七八九';
function fraction(s) {
  if (!s) return 0;
  if (!/[毛角分]/.test(s))
    return Number('0.' + [...s].map((c) => chineseDigits.indexOf(c)).join(''));
  let total = 0;
  for (const match of s.matchAll(/([零一二三四五六七八九十点]+)([毛角分])/g))
    total += chineseNumber(match[1]) * (match[2] === '分' ? 0.01 : 0.1);
  return total;
}
export function chineseNumber(input) {
  const s = input.replaceAll('两', '二').replaceAll('〇', '零');
  if (/[块元]/.test(s)) {
    const [a, b] = s.split(/[块元]/);
    return chineseNumber(a) + fraction(b);
  }
  if (/[毛角分]/.test(s)) return fraction(s);
  if (s.includes('点')) {
    const [a, b] = s.split('点');
    return chineseNumber(a) + Number('0.' + [...b].map((c) => chineseDigits.indexOf(c)).join(''));
  }
  const digits = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 },
    units = { 十: 10, 百: 100, 千: 1000, 万: 10000, 亿: 1e8 };
  if (/^[零一二三四五六七八九]+$/.test(s)) return Number([...s].map((c) => digits[c]).join(''));
  let total = 0,
    section = 0,
    n = 0,
    last = 1;
  for (const c of s) {
    if (c in digits) n = digits[c];
    else if (c in units) {
      const u = units[c];
      last = u;
      if (u < 10000) {
        section += (n || 1) * u;
      } else {
        section += n;
        total += (section || 1) * u;
        section = 0;
      }
      n = 0;
    } else throw Error('无法识别中文金额。');
  }
  if (n && last >= 100 && s.at(-2) !== '零') n *= last / 10;
  return total + section + n;
}

const hints = [
  ['JPY', /日元|日圆|JPY|円/i],
  ['HKD', /港币|港元|HKD|HK\$/i],
  ['USD', /美元|美金|USD|\$/i],
  ['EUR', /欧元|EUR|€/i],
  ['GBP', /英镑|GBP|£/i],
  ['AUD', /澳元|AUD/i],
  ['SGD', /新币|新加坡元|SGD/i],
];
export function parseEntry(input, { today = localDate(), source = 'text' } = {}) {
  const raw = String(input).trim();
  if (!raw || raw.length > 12000) throw Error('请说出或粘贴一笔账目，文字不超过 12000 字。');
  let date = today;
  const dated = raw.match(/(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})日?/);
  if (dated) {
    const d = `${dated[1]}-${dated[2].padStart(2, '0')}-${dated[3].padStart(2, '0')}`;
    if (validDate(d)) date = d;
  } else if (raw.includes('前天')) date = addDays(today, -2);
  else if (raw.includes('昨天')) date = addDays(today, -1);
  const currency = hints.find(([, re]) => re.test(raw))?.[0] || 'CNY';
  const loss = /亏|亏损|赔|损失/.test(raw),
    income = !loss && /收入|到账|收到|收款|工资|薪水|奖金|赚|盈利|退款/.test(raw);
  const type = income ? 'income' : 'expense';
  let clean = raw
    .replace(/20\d{2}[年/.-]\d{1,2}[月/.-]\d{1,2}日?/g, ' ')
    .replace(/\d{1,2}:\d{2}(?::\d{2})?/g, ' ')
    .replace(/(?:订单|交易|流水|卡号|尾号|余额|优惠|原价|单号)[^\n]{0,4}[：:]?\s*[\d,.]+/g, ' ');
  const candidates = [];
  const pattern = new RegExp(
    `(?:[¥￥$€£]\\s*)?(\\d[\\d,]*(?:\\.\\d{1,2})?|[${CN}]+)(?:\\s*(元|人民币|日元|美元|港币|欧元|块|毛|角|分))?`,
    'g',
  );
  for (const m of clean.matchAll(pattern)) {
    const number = m[1],
      before = clean.slice(Math.max(0, m.index - 16), m.index),
      after = clean.slice(m.index + m[0].length, m.index + m[0].length + 8);
    if (/^\d{10,}$/.test(number) || /[年月日号笔]/.test(after[0] || '')) continue;
    let value;
    try {
      value = /\d/.test(number)
        ? parseAmount(number, currency)
        : parseAmount(
            chineseNumber(
              number + (m[2] === '块' ? '' : m[2] && ['毛', '角', '分'].includes(m[2]) ? m[2] : ''),
            ).toFixed(2),
            currency,
          );
      if (/^[毛角分]$/.test(m[2] || '')) value = Math.round(value * (m[2] === '分' ? 0.01 : 0.1));
    } catch {
      continue;
    }
    if (!value) continue;
    let score = 0;
    if (/[¥￥$€£]/.test(m[0]) || m[2] || /[元块毛角分]/.test(number)) score += 2;
    if (/实付|实付款|支付金额|付款金额|收款金额|到账金额/.test(before)) score += 6;
    if (/消费|花了|付了|亏了|亏损|赚了|收入|工资|收到/.test(before)) score += 3;
    if (source === 'ocr' && /合计|总计/.test(before)) score += 2;
    candidates.push({ amount: value, label: m[0], score, index: m.index });
  }
  if (!candidates.length) throw Error('没有找到有效金额，请补充数字或切换金额录入。');
  candidates.sort((a, b) => b.score - a.score);
  const highest = candidates[0].score,
    preferred = candidates.filter((c) => c.score === highest),
    unique = [...new Map(preferred.map((c) => [c.amount, c])).values()];
  let title =
    loss && /股票|炒股/.test(raw)
      ? '股票亏损'
      : /工资|薪水/.test(raw)
        ? '工资'
        : /咖啡|星巴克/.test(raw)
          ? '咖啡'
          : /午饭|午餐/.test(raw)
            ? '午饭'
            : /晚饭|晚餐/.test(raw)
              ? '晚饭'
              : /房租/.test(raw)
                ? '房租'
                : /电话|话费/.test(raw)
                  ? '电话费'
                  : /打车|出租车/.test(raw)
                    ? '打车'
                    : raw
                        .split('\n')
                        .find((l) => l.trim() && !/交易成功|支付成功|付款成功|\d|¥|￥/.test(l)) ||
                      raw
                        .replace(candidates[0].label, '')
                        .replace(/今天|昨天|前天|收入|收到|花了|付了|消费|元/g, '')
                        .trim() ||
                      '日常收支';
  title = title.slice(0, 80);
  const icon = loss
    ? 'trend'
    : type === 'income'
      ? 'wallet'
      : title.includes('咖啡')
        ? 'coffee'
        : title.includes('饭')
          ? 'food'
          : title.includes('房租')
            ? 'home'
            : 'book';
  return {
    title,
    type,
    date,
    currency,
    amount: unique.length === 1 ? unique[0].amount : null,
    candidates: unique,
    ambiguous: unique.length > 1,
    icon,
    source,
    rawText: raw,
  };
}
