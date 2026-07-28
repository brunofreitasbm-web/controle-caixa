import { useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, Check, X } from 'lucide-react';
import Button from './ui/Button.jsx';

/**
 * Captura de foto genérica via getUserMedia (usada em envelopes de caixa,
 * FaçaAmigos, comprovantes, etc). Para biometria facial (embedding via
 * face-api.js) use o componente dedicado em features/ponto.
 */
export default function CameraCapture({ onCapture, onCancel, facingMode = 'environment' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [foto, setFoto] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let cancelado = false;
    async function iniciar() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
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
      } catch {
        setErro('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
      }
    }
    if (!foto) iniciar();
    return () => {
      cancelado = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [facingMode, foto]);

  function tirarFoto() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setFoto(dataUrl);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  function refazer() {
    setFoto(null);
  }

  function confirmar() {
    onCapture(foto);
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full aspect-[4/3] bg-slate-900 rounded-2xl overflow-hidden flex items-center justify-center">
        {erro ? (
          <p className="text-rose-300 text-sm text-center px-6">{erro}</p>
        ) : foto ? (
          <img src={foto} alt="Foto capturada" className="w-full h-full object-cover" />
        ) : (
          <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onCancel}>
          <X size={16} /> Cancelar
        </Button>
        {foto ? (
          <>
            <Button variant="outline" onClick={refazer}>
              <RotateCcw size={16} /> Refazer
            </Button>
            <Button variant="primary" onClick={confirmar}>
              <Check size={16} /> Usar foto
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={tirarFoto} disabled={!!erro}>
            <Camera size={16} /> Capturar
          </Button>
        )}
      </div>
    </div>
  );
}
