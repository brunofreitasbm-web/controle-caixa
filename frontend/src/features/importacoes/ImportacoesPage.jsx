import { Link } from 'react-router-dom';
import { FileCode2, Receipt, Target, ArrowRight } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';

const OPCOES = [
  {
    to: '/importacoes/nfe',
    icon: FileCode2,
    gradient: 'blue',
    titulo: 'Importar NF-e',
    descricao: 'Envie o XML da nota fiscal recebida do CD e confira os produtos antes de enviar.',
  },
  {
    to: '/importacoes/boletos',
    icon: Receipt,
    gradient: 'amber',
    titulo: 'Importar Boletos',
    descricao: 'Envie o PDF do relatório de títulos (Cacau Digital) para extrair os boletos em aberto.',
  },
  {
    to: '/importacoes/metas',
    icon: Target,
    gradient: 'emerald',
    titulo: 'Importar Metas Diárias',
    descricao: 'Envie a planilha "$ Meta Total" por loja para alimentar o Meta Hora a Hora.',
  },
];

export default function ImportacoesPage() {
  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800">Importações</h1>
        <p className="text-sm text-slate-500 mt-1">Escolha o que você quer importar para o sistema.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {OPCOES.map((op) => (
          <Link key={op.to} to={op.to} className="block">
            <Card gradient={op.gradient} className="h-full flex flex-col justify-between cursor-pointer">
              <div>
                <div className="rounded-full bg-white/15 p-3 w-fit mb-4">
                  <op.icon size={24} />
                </div>
                <h2 className="text-lg font-bold">{op.titulo}</h2>
                <p className="text-sm text-white/80 mt-2">{op.descricao}</p>
              </div>
              <div className="flex items-center gap-1 text-sm font-bold mt-6">
                Continuar <ArrowRight size={16} />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
