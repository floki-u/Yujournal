export const OCR_CACHE =
  'yujournal-ocr-v6-fast-874164-' + encodeURIComponent(new URL('../../', import.meta.url).pathname);
let worker = null,
  scriptPromise = null;
async function controlled() {
  if (!('serviceWorker' in navigator)) throw Error('当前浏览器不支持离线识别缓存，请使用 Safari。');
  await navigator.serviceWorker.ready;
  if (navigator.serviceWorker.controller) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('离线缓存正在准备，请重新打开应用。')), 8000);
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
function simd() {
  return WebAssembly.validate(
    new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 9, 1, 7, 0, 65, 0, 253, 15,
      26, 11,
    ]),
  );
}
export function ocrPaths() {
  return [
    'tesseract.min.js',
    'worker.min.js',
    'lang/chi_sim.traineddata.gz',
    'lang/eng.traineddata.gz',
    `core/tesseract-core-${simd() ? 'simd-' : ''}lstm.wasm.js`,
  ].map((p) => new URL(`vendor/ocr/${p}`, document.baseURI).href);
}
export async function ocrReady() {
  const cache = await caches.open(OCR_CACHE);
  return (await Promise.all(ocrPaths().map((p) => cache.match(p)))).every(Boolean);
}
export async function prepareOCR(progress = () => {}) {
  await controlled();
  const cache = await caches.open(OCR_CACHE),
    urls = ocrPaths();
  let completed = 0;
  for (const url of urls) {
    if (!(await cache.match(url))) {
      progress(`准备离线识别 ${completed + 1}/${urls.length}`);
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(60000) });
      if (
        !response.ok ||
        response.redirected ||
        /text\/html/.test(response.headers.get('content-type') || '')
      )
        throw Error('识别资源下载失败，请检查网络后重试。');
      await cache.put(url, response);
    }
    completed++;
    progress(`离线资源 ${completed}/${urls.length}`);
  }
  return true;
}
export async function releaseOCR() {
  if (worker) {
    const w = worker;
    worker = null;
    await w.terminate().catch(() => {});
  }
}
export async function recognize(file, progress) {
  await prepareOCR(progress);
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/ocr/tesseract.min.js';
    s.onload = resolve;
    s.onerror = () => {
      scriptPromise = null;
      reject(Error('识别引擎载入失败。'));
    };
    document.head.append(s);
  });
  await scriptPromise;
  const base = new URL('vendor/ocr/', document.baseURI);
  worker = await Tesseract.createWorker(['chi_sim', 'eng'], 1, {
    workerPath: new URL('worker.min.js', base).href,
    corePath: new URL('core', base).href,
    langPath: new URL('lang', base).href,
    workerBlobURL: false,
    cacheMethod: 'none',
    gzip: true,
    logger: ({ status, progress: p }) =>
      progress(
        `${status === 'recognizing text' ? '识别文字' : '载入引擎'} ${Math.round((p || 0) * 100)}%`,
      ),
  });
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
      user_defined_dpi: '300',
    });
    const result = (await worker.recognize(file)).data;
    return { text: result.text, confidence: result.confidence };
  } finally {
    await releaseOCR();
  }
}
export async function shrinkImage(
  file,
  { max = 2800, pixels = 6000000, quality = 0.9, format = 'image/jpeg', crop = null } = {},
) {
  if (file.size > 30 * 1024 * 1024) throw Error('截图过大，请裁剪付款区域后重试。');
  const url = URL.createObjectURL(file),
    image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(Error('无法打开截图，请选择 PNG、JPEG 或 WebP。'));
      image.src = url;
    });
    const region = crop
      ? {
          x: Math.max(0, crop.x * image.width),
          y: Math.max(0, crop.y * image.height),
          width: crop.width * image.width,
          height: crop.height * image.height,
        }
      : { x: 0, y: 0, width: image.width, height: image.height };
    const scale = Math.min(
      1,
      max / Math.max(region.width, region.height),
      Math.sqrt(pixels / (region.width * region.height)),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(region.width * scale);
    canvas.height = Math.round(region.height * scale);
    canvas
      .getContext('2d')
      .drawImage(
        image,
        region.x,
        region.y,
        region.width,
        region.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    const blob = await new Promise((r) => canvas.toBlob(r, format, quality));
    canvas.width = canvas.height = 0;
    if (!blob) throw Error('截图压缩失败。');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
