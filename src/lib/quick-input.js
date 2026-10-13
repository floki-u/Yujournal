export const QUICK_PREFIX = 'YUJOURNAL-INBOX/1\n';
export function quickText(value) {
  const text = String(value || '');
  if (!text.startsWith(QUICK_PREFIX))
    throw Error('剪贴板里没有余记快捷输入。请先在截图分享菜单运行“余记 · 截图记账”。');
  const content = text.slice(QUICK_PREFIX.length).trim();
  if (!content || content.length > 12000) throw Error('快捷输入为空或过长，请分批识别。');
  return content;
}
export const shortcutFiles = {
  screenshot: 'Yujournal-Screenshot.shortcut',
  voice: 'Yujournal-Voice.shortcut',
};
export function shortcutURL(type, base) {
  if (!shortcutFiles[type]) throw Error('未知快捷指令。');
  return new URL('shortcuts/' + shortcutFiles[type], base).href;
}
