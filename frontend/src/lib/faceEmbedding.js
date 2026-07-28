const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

let modelosPromise = null;

export function carregarModelosFace() {
  if (!window.faceapi) {
    return Promise.reject(new Error('face-api.js não carregado.'));
  }
  if (!modelosPromise) {
    const { nets } = window.faceapi;
    modelosPromise = Promise.all([
      nets.tinyFaceDetector.isLoaded ? null : nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      nets.faceLandmark68TinyNet.isLoaded ? null : nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
      nets.faceRecognitionNet.isLoaded ? null : nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
  }
  return modelosPromise;
}

export async function detectarDescriptor(videoEl) {
  await carregarModelosFace();
  const faceapi = window.faceapi;
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
  const result = await faceapi
    .detectSingleFace(videoEl, options)
    .withFaceLandmarks(true)
    .withFaceDescriptor();
  if (!result) return null;
  return Array.from(result.descriptor);
}

export function distanciaEuclidiana(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let soma = 0;
  for (let i = 0; i < a.length; i += 1) {
    soma += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(soma);
}

// Score de similaridade 0..1 (>= 0.85 é considerado o mesmo rosto, seguindo
// o mesmo limiar já usado no backend em routes/ponto-biometria.js).
export function scoreSimilaridade(a, b) {
  const dist = distanciaEuclidiana(a, b);
  return Math.max(0, 1 - dist / 1.0);
}
