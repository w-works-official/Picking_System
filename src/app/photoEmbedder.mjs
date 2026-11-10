// 🔍 사진 특징값 계산 (2026-11-07) — 기기 안에서 MobileNetV2 실행 (AI 서비스 · 키 · 비용 없음)
//  · 계산 도구 onnxruntime-web(jsdelivr, 버전 고정)과 모델(4.4MB, 이 사이트 assets)은 [사진으로 찾기]를 처음 쓸 때만 받음
//  · 다른 화면(피킹·검품·주문 검색)에서는 아무것도 받지 않음
import { DIM_IN, project, quantize, bytesToB64 } from "../domain/photoSearch.mjs?v=20261110-finder3";

export const ORT_VERSION = "1.20.1";
export const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const SIZE = 224;
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

let ready = null;
function loadScript(document, src) {
  return new Promise((ok, bad) => {
    const s = document.createElement("script");
    s.src = src; s.async = true;
    s.onload = ok; s.onerror = () => bad(new Error("계산 도구를 받지 못했습니다 (인터넷 연결 확인)"));
    document.head.appendChild(s);
  });
}

export function loadEmbedder({ window, document = window.document, modelUrl } = {}) {
  if (ready) return ready;
  ready = (async () => {
    if (!window.ort) await loadScript(document, `${ORT_BASE}ort.wasm.min.js`);
    const ort = window.ort;
    ort.env.wasm.wasmPaths = ORT_BASE;
    ort.env.wasm.numThreads = 1;   // GitHub Pages 는 다중 스레드(교차 출처 격리)가 안 됨
    const url = modelUrl || new URL("../../assets/models/mnv2-feat-f16.onnx", import.meta.url).href;
    const session = await ort.InferenceSession.create(url, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    return { ort, session, input: session.inputNames[0], output: session.outputNames[0] };
  })();
  ready.catch(() => { ready = null; });
  return ready;
}

// 사진(ImageBitmap · img · video · canvas) → 224×224, 흰 바탕에 전체가 들어가게 (crop = 가운데 비율, 1 = 전체)
export function toTensorData(src, { document, crop = 1 } = {}) {
  const w0 = src.videoWidth || src.naturalWidth || src.width, h0 = src.videoHeight || src.naturalHeight || src.height;
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.fillStyle = "#fff"; g.fillRect(0, 0, SIZE, SIZE);
  const cw = w0 * crop, ch = h0 * crop, sx = (w0 - cw) / 2, sy = (h0 - ch) / 2;
  const k = Math.min(SIZE / cw, SIZE / ch);
  const dw = cw * k, dh = ch * k;
  g.drawImage(src, sx, sy, cw, ch, (SIZE - dw) / 2, (SIZE - dh) / 2, dw, dh);
  const px = g.getImageData(0, 0, SIZE, SIZE).data;
  const out = new Float32Array(3 * SIZE * SIZE);
  const plane = SIZE * SIZE;
  for (let i = 0; i < plane; i++) {
    out[i] = (px[i * 4] / 255 - MEAN[0]) / STD[0];
    out[plane + i] = (px[i * 4 + 1] / 255 - MEAN[1]) / STD[1];
    out[2 * plane + i] = (px[i * 4 + 2] / 255 - MEAN[2]) / STD[2];
  }
  return out;
}

// 여러 장을 한 번에 → [256칸 Float32Array]
export async function embed(engine, tensors = []) {
  if (!tensors.length) return [];
  const { ort, session, input, output } = engine;
  const data = new Float32Array(tensors.length * tensors[0].length);
  tensors.forEach((t, i) => data.set(t, i * t.length));
  const res = await session.run({ [input]: new ort.Tensor("float32", data, [tensors.length, 3, SIZE, SIZE]) });
  const feats = res[output].data;
  return tensors.map((_, i) => project(feats.subarray(i * DIM_IN, (i + 1) * DIM_IN)));
}

export const encodeVec = (vec) => bytesToB64(quantize(vec));
