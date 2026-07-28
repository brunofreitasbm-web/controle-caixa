import { useRef, useState } from 'react';
import { UploadCloud, FileText } from 'lucide-react';

/**
 * Dropzone genérica de arquivo único (sem libs externas). onFile recebe o
 * File selecionado — o parse (XML/PDF/CSV/XLSX) fica por conta de quem usa.
 */
export default function FileDropzone({ accept, label = 'Arraste um arquivo ou clique para selecionar', hint, onFile }) {
  const inputRef = useRef(null);
  const [arrastando, setArrastando] = useState(false);
  const [arquivo, setArquivo] = useState(null);

  function receber(file) {
    if (!file) return;
    setArquivo(file);
    onFile?.(file);
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastando(false);
        receber(e.dataTransfer.files?.[0]);
      }}
      className={`w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
        arrastando ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => receber(e.target.files?.[0])}
      />
      <div className="rounded-full bg-blue-50 text-blue-600 p-3">
        {arquivo ? <FileText size={22} /> : <UploadCloud size={22} />}
      </div>
      <p className="text-sm font-bold text-slate-700">{arquivo ? arquivo.name : label}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </button>
  );
}
