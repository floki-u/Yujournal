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
const digests = {
  screenshot: '65097e39e4548676b24c469c41f7670c0b0f7bce8040a77e7ccc029c3c24faf4',
  voice: '873d789279b97d886ab6ad1f7a3fd30bbe6f62cf0833709b30e64eb3b410b595',
};
const prepared = new Map(),
  preparing = new Map();
export function preparedShortcut(type, base) {
  return prepared.get(shortcutURL(type, base));
}
export async function prepareShortcut(type, base) {
  const url = shortcutURL(type, base);
  if (prepared.has(url)) return prepared.get(url);
  if (preparing.has(url)) return preparing.get(url);
  const pending = (async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok || response.headers.get('content-type')?.includes('text/html'))
      throw Error('快捷指令文件暂不可用，请联网重试。');
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 100000 || new TextDecoder().decode(bytes.slice(0, 4)) !== 'AEA1')
      throw Error('快捷指令文件不完整，请重试准备。');
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
    if (digest !== digests[type]) throw Error('快捷指令文件校验失败，请联网重试。');
    const file = new File([bytes], shortcutFiles[type], { type: 'application/octet-stream' });
    prepared.set(url, file);
    return file;
  })();
  preparing.set(url, pending);
  try {
    return await pending;
  } finally {
    preparing.delete(url);
  }
}
// Invoke sharing synchronously from the tap: iOS needs transient activation.
export function shareShortcut(file) {
  if (!navigator.share || !navigator.canShare?.({ files: [file] })) return false;
  return navigator.share({ files: [file], title: '添加余记快捷指令' }).then(() => true);
}
function saveShortcut(file) {
  const url = URL.createObjectURL(file),
    link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function mountShortcutInstallers(root, base = document.baseURI) {
  const groups = new Map();
  for (const button of root.querySelectorAll('button[data-shortcut]')) {
    const type = button.dataset.shortcut;
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(button);
  }
  const loads = [];
  for (const [type, buttons] of groups) {
    const status = root.querySelector(`[data-shortcut-status="${type}"]`);
    const message = (text) => {
      if (status?.isConnected) status.textContent = text;
    };
    const disable = (value) =>
      buttons.forEach((button) => {
        if (button.isConnected) button.disabled = value;
      });
    const load = async () => {
      disable(true);
      message('正在准备安装文件…');
      try {
        await prepareShortcut(type, base);
        message('文件已准备。可打开系统分享面板，或保存到文件后添加。');
      } catch (error) {
        message(
          (error.name === 'TimeoutError'
            ? '准备超时，请检查连接。'
            : error.name === 'TypeError'
              ? '连接失败，请确认余记网页可以正常打开。'
              : error.message) + ' 点按钮可重试。',
        );
      } finally {
        disable(false);
      }
    };
    for (const button of buttons)
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        const file = preparedShortcut(type, base);
        if (!file) {
          await load();
          return;
        }
        try {
          if (button.dataset.shortcutMethod !== 'save') {
            const sharing = shareShortcut(file);
            if (sharing) {
              disable(true);
              await sharing;
              message('已交给系统。选择“存储到文件”后，在“文件”中打开添加。');
              return;
            }
          }
          saveShortcut(file);
          message('已请求保存 .shortcut 文件。请在“文件 → 下载项”打开并添加。');
        } catch (error) {
          message(
            error.name === 'AbortError'
              ? '已取消系统分享，文件仍已准备。'
              : '系统分享暂不可用，请点“保存到文件”。',
          );
        } finally {
          disable(false);
        }
      });
    loads.push(load());
  }
  return Promise.all(loads);
}
