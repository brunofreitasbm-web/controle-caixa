import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';
import Button from '../../../components/ui/Button.jsx';
import { carregarModelosFace, scoreSimilaridade } from '../../../lib/faceEmbedding.js';
import { api } from '../../../lib/apiClient.js';

// Mesmo piso de confiança do detector usado no backend (routes/ponto-biometria.js)
// e no app antigo (webapp/camera-universal.js).
const FACE_DETECTION_MIN_CONFIDENCE = 0.85;
// Limiar de aceite do reconhecimento (mesma regra do backend/scoreSimilaridade).
const FACE_MATCH_MIN_SCORE = 0.85;
const DETECT_INTERVAL_MS = 500;

// Recorta o frame em 3:4 (retrato), igual ao app antigo — evita que a foto
// salva venha em paisagem mesmo com o preview em pé.
function capturarFrameRetrato(video, canvas, aspectAlvo = 3 / 4) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  let sx = 0;
  let sy = 0;
  let sw = vw;
  let sh = vh;
  const aspectAtual = vw / vh;
  if (aspectAtual > aspectAlvo) {
    sw = vh * aspectAlvo;
    sx = (vw - sw) / 2;
  } else if (aspectAtual < aspectAlvo) {
    sh = vw / aspectAlvo;
    sy = (vh - sh) / 2;
  }
  const targetWidth = 480;
  canvas.width = targetWidth;
  canvas.height = Math.round(targetWidth / aspectAlvo);
  canvas.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

/**
 * Captura biométrica facial ao vivo (getUserMedia + face-api.js), sem usar o
 * CameraCapture.jsx genérico — aqui precisamos analisar frames continuamente,
 * não só tirar uma foto.
 *
 * Se `savedEmbedding` vier vazio/nulo, opera em modo self-enrollment (grava
 * o primeiro rosto detectado com confiança suficiente via
 * POST /api/ponto/biometria). Se vier preenchido, opera em modo verificação:
 * compara cada rosto detectado com o embedding salvo via scoreSimilaridade
 * (limiar 0.85, replicando o backend) e nunca envia nada ao servidor sozinho
 * — quem chama decide o que fazer com o resultado (normalmente incluir a
 * foto/hora/GPS no registro de ponto).
 */
export default function BiometriaCapture({ usuario, savedEmbedding, onEnrolled, onVerified, onCancel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const busyRef = useRef(false);
  const encerradoRef = useRef(false);

  const [estado, setEstado] = useState('iniciando'); // iniciando | procurando | processando | ok | erro
  const [mensagem, setMensagem] = useState('Preparando câmera...');

  const modoEnroll = !savedEmbedding || savedEmbedding.length === 0;

  useEffect(() => {
    encerradoRef.current = false;
    let cancelado = false;

    async function tick() {
      if (busyRef.current || encerradoRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !window.faceapi) return;
      busyRef.current = true;
      try {
        const faceapi = window.faceapi;
        const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
        const result = await faceapi.detectSingleFace(video, options).withFaceLandmarks(true).withFaceDescriptor();

        if (encerradoRef.current) return;

        if (!result) {
          setEstado('procurando');
          setMensagem('Aproxime o rosto da câmera.');
          return;
        }

        const detectionScore = result.detection.score;
        const descriptor = Array.from(result.descriptor);

        if (detectionScore < FACE_DETECTION_MIN_CONFIDENCE) {
          setEstado('procurando');
          setMensagem('Melhore o enquadramento/iluminação e olhe para a câmera.');
          return;
        }

        if (modoEnroll) {
          encerradoRef.current = true;
          setEstado('processando');
          setMensagem('Cadastrando biometria...');
          const foto = capturarFrameRetrato(video, canvasRef.current);
          try {
            const resp = await api.post('/api/ponto/biometria', { usuario, embedding: descriptor, detectionScore });
            if (resp?.status === 'ENROLLED') {
              setEstado('ok');
              setMensagem('Biometria cadastrada com sucesso!');
              pararCamera();
              onEnrolled?.({ descriptor, detectionScore, photoDataUrl: foto });
            } else if (resp?.status === 'TEMPORARILY_BLOCKED') {
              setEstado('erro');
              setMensagem('Muitas tentativas sem sucesso. Procure o RH/Administrador para liberar novas tentativas.');
              pararCamera();
            } else {
              setEstado('erro');
              setMensagem(
                `Qualidade insuficiente. Tentativas restantes: ${resp?.attemptsRemaining ?? '—'}. Tentando novamente...`
              );
              encerradoRef.current = false;
            }
          } catch (err) {
            setEstado('erro');
            setMensagem(err.message || 'Não foi possível salvar a biometria facial.');
            encerradoRef.current = false;
          }
          return;
        }

        // Modo verificação: compara com o embedding já cadastrado.
        const score = scoreSimilaridade(descriptor, savedEmbedding);
        if (score >= FACE_MATCH_MIN_SCORE) {
          encerradoRef.current = true;
          const foto = capturarFrameRetrato(video, canvasRef.current);
          setEstado('ok');
          setMensagem('Rosto reconhecido!');
          pararCamera();
          onVerified?.({ descriptor, detectionScore, matchScore: score, photoDataUrl: foto });
        } else {
          setEstado('procurando');
          setMensagem('Rosto não reconhecido. Posicione-se novamente.');
        }
      } catch (err) {
        console.error('Erro na detecção facial:', err);
      } finally {
        busyRef.current = false;
      }
    }

    function pararCamera() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    async function iniciar() {
      try {
        setMensagem('Carregando modelo de reconhecimento facial...');
        await carregarModelosFace();
        if (cancelado) return;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setEstado('procurando');
        setMensagem(modoEnroll ? 'Posicione o rosto para cadastrar sua biometria.' : 'Posicione o rosto para reconhecimento.');
        intervalRef.current = setInterval(tick, DETECT_INTERVAL_MS);
      } catch (err) {
        console.error('Erro ao acessar câmera:', err);
        setEstado('erro');
        setMensagem('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
      }
    }

    iniciar();

    return () => {
      cancelado = true;
      encerradoRef.current = true;
      pararCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario, modoEnroll]);

  const icone =
    estado === 'ok' ? (
      <CheckCircle2 className="text-emerald-500" size={20} />
    ) : estado === 'erro' ? (
      <TriangleAlert className="text-amber-500" size={20} />
    ) : estado === 'processando' ? (
      <Loader2 className="animate-spin text-blue-600" size={20} />
    ) : (
      <Camera className="text-blue-600" size={20} />
    );

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full max-w-xs aspect-[3/4] bg-slate-900 rounded-2xl overflow-hidden relative">
        <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
        <div
          className={`absolute inset-4 rounded-2xl border-4 transition-colors ${
            estado === 'ok'
              ? 'border-emerald-400'
              : estado === 'erro'
                ? 'border-amber-400'
                : 'border-white/40'
          }`}
        />
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <div className="flex items-center gap-2 text-sm font-bold text-slate-700 text-center">
        {icone}
        <span>{mensagem}</span>
      </div>
      <p className="text-xs text-slate-400 text-center">
        {modoEnroll
          ? 'Primeiro cadastro biométrico — usado para reconhecer você nas próximas marcações.'
          : 'Reconhecimento facial obrigatório para bater o ponto.'}
      </p>
      {onCancel && (
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      )}
    </div>
  );
}
