import { useEffect, useRef, useState } from 'react';
import { MapPin, Save } from 'lucide-react';
import { toast } from 'sonner';
import Card, { CardHeader } from '../../../components/ui/Card.jsx';
import Table, { Tr, Td } from '../../../components/ui/Table.jsx';
import Input from '../../../components/ui/Input.jsx';
import Button from '../../../components/ui/Button.jsx';
import { LoadingBlock } from '../../../components/ui/Spinner.jsx';
import { useConfig, useSalvarConfig } from '../../../hooks/useConfiguracoes.js';

// As mesmas 6 operações e os mesmos nomes de chave usados hoje pelo app
// antigo (webapp/app.js: LOJAS_GEOLOC / OPERACOES_CONFIG / GEOFENCE_RAIO_METROS,
// persistidos via GET/POST /api/config nas chaves "operacoesGeoloc",
// "operacoesConfig" e "geofenceRaioMetros"). O módulo de Ponto (outro agente)
// consome essas mesmas chaves para validar a cerca virtual — não renomear.
const LOJAS_CACAU = ['Marambaia', 'Icoaraci', 'Mário Covas'];
const LOJAS_FA = ['Grão Pará', 'ParqueShopping', 'Parque Circuito'];
const OPERACOES = [...LOJAS_CACAU, ...LOJAS_FA];

const HORARIO_PADRAO = {
  Marambaia: { abertura: '09:00', fechamento: '22:00' },
  Icoaraci: { abertura: '09:00', fechamento: '22:00' },
  'Mário Covas': { abertura: '09:00', fechamento: '22:00' },
  'Grão Pará': { abertura: '10:00', fechamento: '22:00' },
  ParqueShopping: { abertura: '10:00', fechamento: '22:00' },
  'Parque Circuito': { abertura: '10:00', fechamento: '22:00' },
};

function parseObjeto(valor, fallback) {
  if (!valor) return fallback;
  if (typeof valor === 'object') return valor;
  try {
    const parsed = JSON.parse(valor);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export default function OperacoesCard() {
  const configQuery = useConfig();
  const salvar = useSalvarConfig();

  const [geoloc, setGeoloc] = useState({});
  const [horarios, setHorarios] = useState({});
  const [raio, setRaio] = useState(50);
  const [salvando, setSalvando] = useState(false);
  const hidratado = useRef(false);

  useEffect(() => {
    if (!configQuery.data || hidratado.current) return;
    const geolocSalvo = parseObjeto(configQuery.data.operacoesGeoloc, {});
    const horariosSalvos = parseObjeto(configQuery.data.operacoesConfig, {});

    const geolocInicial = {};
    const horariosIniciais = {};
    OPERACOES.forEach((op) => {
      geolocInicial[op] = { lat: geolocSalvo[op]?.lat ?? 0, lng: geolocSalvo[op]?.lng ?? 0 };
      horariosIniciais[op] = {
        abertura: horariosSalvos[op]?.abertura || HORARIO_PADRAO[op].abertura,
        fechamento: horariosSalvos[op]?.fechamento || HORARIO_PADRAO[op].fechamento,
      };
    });
    setGeoloc(geolocInicial);
    setHorarios(horariosIniciais);
    setRaio(parseInt(configQuery.data.geofenceRaioMetros, 10) || 50);
    hidratado.current = true;
  }, [configQuery.data]);

  function atualizarGeoloc(op, campo, valor) {
    setGeoloc((prev) => ({ ...prev, [op]: { ...prev[op], [campo]: valor } }));
  }

  function atualizarHorario(op, campo, valor) {
    setHorarios((prev) => ({ ...prev, [op]: { ...prev[op], [campo]: valor } }));
  }

  async function salvarTudo() {
    const raioNum = parseInt(raio, 10);
    if (Number.isNaN(raioNum) || raioNum < 10 || raioNum > 500) {
      toast.error('Informe um raio de cerca entre 10 e 500 metros.');
      return;
    }

    const novoGeoloc = {};
    const novoHorario = {};
    OPERACOES.forEach((op) => {
      novoGeoloc[op] = { lat: parseFloat(geoloc[op]?.lat) || 0, lng: parseFloat(geoloc[op]?.lng) || 0 };
      novoHorario[op] = {
        abertura: horarios[op]?.abertura || HORARIO_PADRAO[op].abertura,
        fechamento: horarios[op]?.fechamento || HORARIO_PADRAO[op].fechamento,
      };
    });

    setSalvando(true);
    try {
      await Promise.all([
        salvar.mutateAsync({ chave: 'operacoesGeoloc', valor: JSON.stringify(novoGeoloc) }),
        salvar.mutateAsync({ chave: 'operacoesConfig', valor: JSON.stringify(novoHorario) }),
        salvar.mutateAsync({ chave: 'geofenceRaioMetros', valor: raioNum }),
      ]);
      toast.success('Localização, horários e raio da cerca salvos com sucesso.');
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar as configurações de operações.');
    } finally {
      setSalvando(false);
    }
  }

  if (configQuery.isLoading) {
    return (
      <Card className="animate-fade-in">
        <CardHeader title="Operações" subtitle="Localização, horário e cerca virtual do ponto" />
        <LoadingBlock label="Carregando configurações..." />
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in">
      <CardHeader
        title="Operações"
        subtitle="Geolocalização, horário de funcionamento e raio da cerca virtual do ponto, por loja"
      />

      <Table columns={['Operação', 'Latitude', 'Longitude', 'Abertura', 'Fechamento']}>
        {OPERACOES.map((op) => (
          <Tr key={op}>
            <Td className="font-bold text-slate-800">{op}</Td>
            <Td>
              <Input
                type="number"
                step="0.0001"
                className="w-28"
                value={geoloc[op]?.lat ?? 0}
                onChange={(e) => atualizarGeoloc(op, 'lat', e.target.value)}
              />
            </Td>
            <Td>
              <Input
                type="number"
                step="0.0001"
                className="w-28"
                value={geoloc[op]?.lng ?? 0}
                onChange={(e) => atualizarGeoloc(op, 'lng', e.target.value)}
              />
            </Td>
            <Td>
              <Input
                type="time"
                className="w-28"
                value={horarios[op]?.abertura ?? HORARIO_PADRAO[op].abertura}
                onChange={(e) => atualizarHorario(op, 'abertura', e.target.value)}
              />
            </Td>
            <Td>
              <Input
                type="time"
                className="w-28"
                value={horarios[op]?.fechamento ?? HORARIO_PADRAO[op].fechamento}
                onChange={(e) => atualizarHorario(op, 'fechamento', e.target.value)}
              />
            </Td>
          </Tr>
        ))}
      </Table>

      <div className="flex flex-wrap items-end justify-between gap-4 mt-4 pt-4 border-t border-gray-100">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-700 mb-1.5">
            <MapPin size={14} /> Raio da cerca do ponto (metros)
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={10}
              max={500}
              step={5}
              className="w-28"
              value={raio}
              onChange={(e) => setRaio(e.target.value)}
            />
            <span className="text-xs text-slate-500 max-w-xs">
              Muito baixo bloqueia quem está dentro da loja; muito alto anula a cerca.
            </span>
          </div>
        </div>
        <Button onClick={salvarTudo} disabled={salvando}>
          <Save size={16} />
          {salvando ? 'Salvando...' : 'Salvar localização e horários'}
        </Button>
      </div>
    </Card>
  );
}
