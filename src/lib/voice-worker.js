import { env, pipeline } from '../../vendor/voice/transformers.min.js';
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL('../../vendor/voice/models/', import.meta.url).href;
env.useBrowserCache = false;
env.useFSCache = false;
env.backends.onnx.wasm.wasmPaths = new URL('../../vendor/voice/', import.meta.url).href;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
let model = null;
self.onmessage = async (event) => {
  const { id, audio } = event.data;
  try {
    self.postMessage({ id, type: 'progress', message: '载入本机中文语音模型…' });
    model ??= await pipeline('automatic-speech-recognition', 'whisper-base', {
      device: 'wasm',
      dtype: 'q8',
      local_files_only: true,
      progress_callback: (info) => {
        if (info.status === 'progress')
          self.postMessage({
            id,
            type: 'progress',
            message: '载入模型 ' + Math.round(info.progress || 0) + '%',
          });
      },
    });
    self.postMessage({ id, type: 'progress', message: '正在本机识别，可稍候或取消…' });
    const result = await model(audio, {
      language: 'chinese',
      task: 'transcribe',
      chunk_length_s: 25,
      stride_length_s: 3,
    });
    self.postMessage({ id, type: 'result', text: result.text });
  } catch (error) {
    self.postMessage({ id, type: 'error', message: error.message || '本机语音识别失败。' });
  }
};
