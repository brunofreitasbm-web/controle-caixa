// ==========================================================================
// CameraUniversal — componente de câmera fullscreen reutilizável.
// Hoje só o modo "enrollment" (self-enrollment biométrico) está ligado a um
// fluxo real. "clock-in" existe apenas como configuração documentada — o
// Registro de Ponto continua usando seu próprio fluxo em app.js nesta fase,
// para não mexer numa feature de produção já em uso. "nfe-ocr"/"inventory"
// são placeholders para uma migração futura dos scanners de código de barras.
// ==========================================================================

const CameraUniversal = (function () {
  // face-api.js-models reorganizou os pesos em subpastas por modelo (ex.:
  // /tiny_face_detector/tiny_face_detector_model-...), então a URL "flat"
  // antiga passou a 404. O repo principal face-api.js ainda serve os mesmos
  // pesos em /weights, todos no mesmo nível — usamos essa fonte.
  const MODEL_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";
  const FACE_MIN_CONFIDENCE = 0.85; // mesmo piso usado no Registro de Ponto (app.js)
  const FACE_MIN_AREA_RATIO = 0.05; // rosto ocupando <5% do frame = "muito longe"
  const LUMINANCE_MIN = 70;         // 0-255, luma média mínima para considerar bem iluminado
  const DETECT_INTERVAL_MS = 400;

  const MODE_CONFIG = {
    enrollment: { mask: "oval", faceDetection: true, endpoint: "/ponto/biometria" },
    "clock-in": { mask: "oval", faceDetection: true, endpoint: null },
    "nfe-ocr": { mask: "rect", faceDetection: false, endpoint: null },
    inventory: { mask: "rect", faceDetection: false, endpoint: null },
  };

  const STATES = {
    INVALID: { css: "state-invalid", text: "Aproxime o rosto" },
    DARK: { css: "state-dark", text: "Melhore a iluminação" },
    READY: { css: "state-ready", text: "Perfeito! Toque para capturar" },
  };

  let luminanceCanvas = null;
  const state = {
    mode: null,
    stream: null,
    interval: null,
    modelsReady: false,
    current: null, // { descriptor, detectionScore } do último tick válido
    options: null,
  };

  function el(id) {
    return document.getElementById(id);
  }

  async function ensureModelsLoaded() {
    if (state.modelsReady) return;
    if (typeof faceapi === "undefined") {
      throw new Error("face-api.js não está carregado.");
    }
    if (!faceapi.nets.tinyFaceDetector.isLoaded) {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
    }
    state.modelsReady = true;
  }

  function sampleLuminance(video) {
    const w = 32, h = 24; // sonda grosseira de brilho, não uma foto
    const cvs = luminanceCanvas || (luminanceCanvas = document.createElement("canvas"));
    cvs.width = w;
    cvs.height = h;
    const ctx = cvs.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; // luma Rec.601
    }
    return sum / (data.length / 4);
  }

  function applyState(key) {
    const info = STATES[key];
    const mask = el("camera-universal-mask");
    const statusText = el("camera-universal-status-text");
    const captureBtn = el("camera-universal-capture");
    if (mask) {
      mask.classList.remove(STATES.INVALID.css, STATES.DARK.css, STATES.READY.css);
      mask.classList.add(info.css);
    }
    if (statusText) statusText.textContent = info.text;
    if (captureBtn) captureBtn.disabled = key !== "READY";
  }

  async function tick() {
    const video = el("camera-universal-video");
    if (!video || video.readyState < 2) return;

    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (!detection) {
      state.current = null;
      applyState("INVALID");
      return;
    }

    const box = detection.detection.box;
    const areaRatio = (box.width * box.height) / (video.videoWidth * video.videoHeight);
    const scoreOk = detection.detection.score >= FACE_MIN_CONFIDENCE;
    const areaOk = areaRatio >= FACE_MIN_AREA_RATIO;

    if (!scoreOk || !areaOk) {
      state.current = null;
      applyState("INVALID");
      return;
    }

    const luminance = sampleLuminance(video);
    if (luminance < LUMINANCE_MIN) {
      state.current = null;
      applyState("DARK");
      return;
    }

    state.current = {
      descriptor: Array.from(detection.descriptor),
      detectionScore: detection.detection.score,
    };
    applyState("READY");
  }

  async function handleCapture() {
    const config = MODE_CONFIG[state.mode];
    const detected = state.current;
    const options = state.options || {};
    if (!config || !detected) return;

    const captureBtn = el("camera-universal-capture");
    if (captureBtn) captureBtn.disabled = true;

    if (!config.endpoint) {
      close(false);
      if (typeof options.onCapture === "function") {
        options.onCapture({ status: "CAPTURED", descriptor: detected.descriptor, detectionScore: detected.detectionScore });
      }
      return;
    }

    try {
      const res = await fetch(`${API_BASE}${config.endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usuario: options.usuario,
          embedding: detected.descriptor,
          detectionScore: detected.detectionScore,
        }),
      });
      const data = await res.json();

      if (data.status === "ENROLLED") {
        close(false);
        if (typeof options.onCapture === "function") options.onCapture(data);
      } else if (data.status === "TEMPORARILY_BLOCKED") {
        close(false);
        if (typeof options.onCapture === "function") options.onCapture(data);
      } else {
        // REJECTED_RETRYABLE — mantém a câmera aberta, libera recaptura imediata
        if (typeof options.onCapture === "function") options.onCapture(data);
      }
    } catch (err) {
      if (captureBtn) captureBtn.disabled = false;
      if (typeof options.onCapture === "function") {
        options.onCapture({ status: "ERROR", error: err.message });
      }
    }
  }

  async function open(mode, options = {}) {
    const config = MODE_CONFIG[mode];
    if (!config) throw new Error(`Modo de câmera desconhecido: ${mode}`);

    const overlay = el("camera-universal-overlay");
    const mask = el("camera-universal-mask");
    const video = el("camera-universal-video");
    const captureBtn = el("camera-universal-capture");
    const closeBtn = el("camera-universal-close");
    if (!overlay || !video || !mask || !captureBtn || !closeBtn) {
      throw new Error("Markup da câmera universal não encontrado no DOM.");
    }

    state.mode = mode;
    state.options = options;
    state.current = null;

    mask.className = `camera-universal-mask camera-universal-mask-${config.mask}`;
    applyState("INVALID");

    captureBtn.onclick = handleCapture;
    closeBtn.onclick = () => close(true);

    overlay.classList.remove("hidden");

    try {
      if (config.faceDetection) await ensureModelsLoaded();
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false,
      });
      video.srcObject = state.stream;
      if (config.faceDetection) {
        state.interval = setInterval(tick, DETECT_INTERVAL_MS);
      }
    } catch (err) {
      close(false);
      if (typeof options.onCancel === "function") options.onCancel(err);
      throw err;
    }
  }

  function close(userCancelled) {
    if (state.interval) {
      clearInterval(state.interval);
      state.interval = null;
    }
    if (state.stream) {
      state.stream.getTracks().forEach((t) => t.stop());
      state.stream = null;
    }
    const overlay = el("camera-universal-overlay");
    const video = el("camera-universal-video");
    if (video) video.srcObject = null;
    if (overlay) overlay.classList.add("hidden");

    const cancelledCallback = state.options && typeof state.options.onCancel === "function" ? state.options.onCancel : null;
    state.mode = null;
    state.current = null;
    state.options = null;

    if (userCancelled && cancelledCallback) cancelledCallback();
  }

  return { open, close, MODE_CONFIG };
})();
