import { localDate, addDays, validDate } from './dates.js';
import { parseAmount, assertAmount } from './money.js';
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
  if (s.includes('点') && /[万亿千百]$/.test(s))
    return chineseNumber(s.slice(0, -1)) * { 万: 10000, 亿: 1e8, 千: 1000, 百: 100 }[s.at(-1)];
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
  const ocrOutgoing = /支付成功|付款成功|支出|转出|实付|付款金额|支付金额/.test(raw);
  const ocrIncoming =
    /收款成功|收款到账|已收款|收入|已到账|到账金额|退款到账|工资到账/.test(raw) ||
    /(?:^|\s)[+＋]\s*[¥￥$]?\d/.test(raw);
  const type =
    source === 'ocr'
      ? !loss && !ocrOutgoing && ocrIncoming
        ? 'income'
        : 'expense'
      : income
        ? 'income'
        : 'expense';
  const compound = raw.replace(
    /(\d+(?:\.\d{1,2})?)([万亿千百])\s*(\d+(?:\.\d{1,2})?)([万千百])(?:元|块)?/g,
    (_, a, u, b, v) =>
      String(
        Number(a) * { 万: 10000, 亿: 1e8, 千: 1000, 百: 100 }[u] +
          Number(b) * { 万: 10000, 千: 1000, 百: 100 }[v],
      ) + '元',
  );
  let clean = compound
    .replace(/20\d{2}[年/.-]\d{1,2}[月/.-]\d{1,2}日?/g, ' ')
    .replace(/\d{1,2}:\d{2}(?::\d{2})?/g, ' ')
    .replace(
      /(?:订单号|订单编号|交易单号|交易号|流水号|卡号|尾号|余额|优惠|原价|单号)\s*[：:]?\s*[¥￥]?\s*[\d,.]+/g,
      ' ',
    );
  const candidates = [];
  const pattern = new RegExp(
    `(?:[¥￥$€£]\\s*)?(\\d[\\d,]*(?:\\.\\d{1,2})?(?:万|亿|千|百)?|[${CN}]+)(?:\\s*(元|人民币|日元|美元|港币|欧元|块|毛|角|分))?`,
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
        ? assertAmount(
            parseAmount(number.replace(/[万亿千百]$/, ''), 'CNY') *
              ({ 万: 10000, 亿: 1e8, 千: 1000, 百: 100 }[number.at(-1)] || 1),
          )
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
    if (!value || (currency === 'JPY' && value % 100)) continue;
    let score = 0;
    if (/[¥￥$€£]/.test(m[0]) || m[2] || /[元块毛角分]/.test(number)) score += 2;
    if (/实付|实付款|交易金额|支付金额|付款金额|收款金额|到账金额|实收|税后/.test(before))
      score += 6;
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

const traditional = {
  虧: '亏',
  損: '损',
  飯: '饭',
  塊: '块',
  萬: '万',
  億: '亿',
  兩: '两',
  錢: '钱',
  資: '资',
  銀: '银',
  賬: '账',
  買: '买',
  費: '费',
  電: '电',
  話: '话',
  賺: '赚',
  轉: '转',
  後: '后',
  餘: '余',
  總: '总',
  號: '号',
};
export function normalizeRecognition(text) {
  return String(text)
    .normalize('NFKC')
    .replace(/[虧損飯塊萬億兩錢資銀賬買費電話賺轉後餘總號]/g, (c) => traditional[c])
    .replace(/[−﹣]/g, '-')
    .replace(/([¥￥$€£])\s*[Oo](?=\d|\.)/g, '$10');
}
export function parseBatch(input, { today = localDate(), source = 'text', receipt = false } = {}) {
  const raw = normalizeRecognition(input).trim();
  if (!raw || raw.length > 12000) throw Error('请输入一段不超过 12000 字的记录。');
  if (receipt) {
    const parsed = parseEntry(raw, { today, source: 'ocr' });
    return { items: [{ ...parsed, selected: true }], warnings: [] };
  }
  if (source === 'ocr' && raw.includes('\n')) return parseOCRList(raw, { today });
  const items = [],
    warnings = [];
  let currentDate = today;
  const clauses = raw
    .replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1')
    .split(/[\n；;。！？!?，,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const clause of clauses) {
    if (items.length && /^(?:一共|合计|总共|总计|加起来|余额)/.test(clause)) {
      warnings.push('汇总信息未另算一笔：' + clause);
      continue;
    }
    const masked = clause
      .replace(/20\d{2}[年/.-]\d{1,2}[月/.-]\d{1,2}日?/g, (m) => ' '.repeat(m.length))
      .replace(/\d{1,2}:\d{2}(?::\d{2})?/g, (m) => ' '.repeat(m.length));
    const pattern = new RegExp(
      `(?:[¥￥$€£]\\s*)?(?:\\d+(?:\\.\\d{1,2})?(?:万|亿|千|百)?|[${CN}]+)(?:\\s*(?:元|人民币|美元|美金|日元|港币|欧元|英镑|块))?`,
      'g',
    );
    let matches = [...masked.matchAll(pattern)].filter(
      (m) => !/[年月日号笔岁杯份次张个]/.test(masked[m.index + m[0].length] || ''),
    );
    matches = matches.filter((m) => {
      if (/[¥￥$€£元块毛角分十百千万亿]/.test(m[0])) return true;
      const after = masked.slice(m.index + m[0].length),
        before = masked.slice(Math.max(0, m.index - 12), m.index);
      return (
        /\d/.test(m[0]) &&
        (!after ||
          /^\s*(咖啡|午饭|晚饭|房租|股票|工资|打车|买菜|电话)/.test(after) ||
          /花了|消费|支付|收入|亏|赚|工资|房租|咖啡|午饭|晚饭|打车/.test(before))
      );
    });
    const alternative = /税前|税后|原价|实付|优惠|实收|余额/.test(clause);
    const parts =
      matches.length > 1 && !alternative
        ? matches.map((m, i) =>
            clause.slice(
              i ? matches[i - 1].index + matches[i - 1][0].length : 0,
              m.index + m[0].length,
            ),
          )
        : [clause];
    for (let part of parts) {
      part = part.replace(/^(?:然后|还有|另外|接着|以及|并且|但是|又)\s*/, '').trim();
      if (!part) continue;
      try {
        const parsed = parseEntry(part, { today, source });
        const explicit = /今天|昨天|前天|20\d{2}[年/.-]/.test(part);
        if (explicit) currentDate = parsed.date;
        else parsed.date = currentDate;
        items.push({ ...parsed, selected: true });
      } catch (e) {
        warnings.push('尚未识别为账目：' + part);
      }
    }
  }
  if (!items.length) throw Error('没有找到可确认的收支。请补充金额，或修改识别文字。');
  if (items.length > 50) throw Error('一次最多确认 50 笔，请分批录入。');
  return { items, warnings };
}
function parseOCRList(raw, { today }) {
  const lines = raw
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean),
    items = [],
    warnings = [];
  let context = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/原价|优惠|余额|合计|总计|订单号|流水号|交易号/.test(line)) {
      warnings.push('辅助信息未入账：' + line);
      continue;
    }
    const money =
      /[+\-¥￥$€£]\s*\d+(?:[,.]\d{1,2})?|\d+\.\d{2}\s*(?:元)?|(?:支付金额|收入金额|付款金额|到账金额)\s*[:：]?\s*\d/.test(
        line,
      );
    if (!money) {
      context.push(line);
      if (context.length > 3) context.shift();
      continue;
    }
    const title =
      context
        .filter((l) => !/\d{1,2}[月/.-]\d{1,2}|收支|记录|明细|余额|账单|交易成功/.test(l))
        .at(-1) || '';
    const next = lines[i + 1] || '',
      dated =
        line + ' ' + context.join(' ') + ' ' + (/\d{1,2}[月/.-]\d{1,2}/.test(next) ? next : '');
    let date = today;
    const dateText = next + ' ' + line + ' ' + context.join(' '),
      full = dateText.match(/(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})日?/),
      partial = dateText.match(/(?:^|\D)(\d{1,2})[月/-](\d{1,2})日?/);
    const parts = full
      ? [full[1], full[2], full[3]]
      : partial
        ? [today.slice(0, 4), partial[1], partial[2]]
        : null;
    if (parts) {
      const candidate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      if (validDate(candidate)) date = candidate;
    }
    try {
      const t = parseEntry((title ? title + ' ' : '') + line, { today, source: 'ocr' });
      t.date = date;
      if (title) t.title = title.slice(0, 80);
      items.push({ ...t, selected: true });
    } catch {
      warnings.push('需要核对：' + line);
    }
    context = [];
  }
  if (!items.length) throw Error('没有找到清晰的交易列表金额，请修改识别文字或选择单张付款凭证。');
  if (items.length > 50) throw Error('一次最多确认 50 笔。');
  return { items, warnings };
}
