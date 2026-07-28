import { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import Card from '../../components/ui/Card.jsx';
import Select from '../../components/ui/Select.jsx';
import { Field } from '../../components/ui/Input.jsx';
import { LoadingBlock } from '../../components/ui/Spinner.jsx';
import { getCurrentUser } from '../../lib/auth.js';
import { useColaboradoresFa } from '../../hooks/useFacaAmigos.js';
import { competenciaAtual, UNIDADES_FA, UNIDADES_FA_CONVERSAO } from './constants.js';
import MetaConversaoBloco from './components/MetaConversaoBloco.jsx';
import MetaLocacoesBloco from './components/MetaLocacoesBloco.jsx';

export default function MetaPage() {
  const usuarioAtual = getCurrentUser();
  const colaboradorasQuery = useColaboradoresFa();
  const competencia = competenciaAtual();

  const [unidade, setUnidade] = useState('ParqueShopping');
  const [colaboradora, setColaboradora] = useState('');

  const colaboradoras = colaboradorasQuery.data || [];

  useEffect(() => {
    if (colaboradora) return;
    if (usuarioAtual?.role === 'consultora_fa') {
      setColaboradora(usuarioAtual.nome);
    } else if (colaboradoras.length > 0) {
      setColaboradora(colaboradoras[0].nome);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colaboradoras]);

  const ehConversao = UNIDADES_FA_CONVERSAO.includes(unidade);

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-emerald-100 text-emerald-600 p-2.5">
            <Target size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Meta FaçaAmigos</h1>
            <p className="text-sm text-slate-500">Competência {competencia}</p>
          </div>
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Unidade">
            <Select value={unidade} onChange={(e) => setUnidade(e.target.value)}>
              {UNIDADES_FA.map((u) => (
                <option key={u} value={u}>{u}{u === 'ParqueShopping' ? ' (Playground)' : u === 'Parque Circuito' ? ' (Carrinhos)' : ''}</option>
              ))}
            </Select>
          </Field>
          <Field label="Colaboradora do dia">
            {colaboradorasQuery.isLoading ? (
              <LoadingBlock label="Carregando..." />
            ) : (
              <Select value={colaboradora} onChange={(e) => setColaboradora(e.target.value)}>
                {colaboradoras.map((c) => (
                  <option key={c.nome} value={c.nome}>{c.nome}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </Card>

      {colaboradora && (
        ehConversao ? (
          <MetaConversaoBloco unidade={unidade} usuarioAlvo={colaboradora} competencia={competencia} />
        ) : (
          <MetaLocacoesBloco unidade={unidade} usuarioAlvo={colaboradora} competencia={competencia} />
        )
      )}
    </div>
  );
}
