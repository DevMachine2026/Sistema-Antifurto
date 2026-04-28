import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  PlayCircle, Users, CreditCard, ShoppingBag,
  CheckCircle2, AlertTriangle, Loader2, Trash2,
  ChevronRight, Bell, Banknote
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { dataService } from '../services/dataService';
import { cn } from '../lib/utils';

const ESTABLISHMENT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

type StepStatus = 'idle' | 'loading' | 'done' | 'error';
type LogEntry = { time: string; message: string; type: 'info' | 'success' | 'alert' | 'error' };

interface StepResult {
  alerts: { alert_type: string; severity: string; description: string }[];
}

export default function Simulator() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [people, setPeople] = useState(85);
  const [stAmount, setStAmount] = useState(1800);
  const [pagbankAmount, setPagbankAmount] = useState(900);
  const [stepStatus, setStepStatus] = useState<Record<string, StepStatus>>({});
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  function addLog(message: string, type: LogEntry['type'] = 'info') {
    const time = new Date().toLocaleTimeString('pt-br');
    setLog(prev => [{ time, message, type }, ...prev]);
  }

  async function setStep(id: string, status: StepStatus) {
    setStepStatus(prev => ({ ...prev, [id]: status }));
  }

  async function resetDemo() {
    await setStep('reset', 'loading');
    addLog('Limpando banco de dados...', 'info');
    try {
      await supabase.from('alerts').delete().eq('establishment_id', ESTABLISHMENT_ID);
      await supabase.from('transactions').delete().eq('establishment_id', ESTABLISHMENT_ID);
      await supabase.from('people_count_events').delete().eq('establishment_id', ESTABLISHMENT_ID);
      await supabase.from('cash_payment_events').delete().eq('establishment_id', ESTABLISHMENT_ID);
      await supabase.from('import_batches').delete().eq('establishment_id', ESTABLISHMENT_ID);
      setCompletedSteps(new Set());
      setStepStatus({});
      setLog([]);
      addLog('Sistema resetado. Banco limpo. Pronto para demo.', 'success');
    } catch (e: any) {
      addLog(`Erro ao resetar: ${e.message}`, 'error');
      await setStep('reset', 'error');
    }
  }

  async function simulateSTIngressos() {
    await setStep('st', 'loading');
    addLog(`Importando ${Math.ceil(stAmount / 180)} transações do ST Ingressos...`, 'info');
    try {
      const { data: batch } = await supabase
        .from('import_batches')
        .insert({
          establishment_id: ESTABLISHMENT_ID,
          source: 'st_ingressos',
          filename: `ST_INGRESSOS_DEMO_${Date.now()}.csv`,
          rows_total: Math.ceil(stAmount / 180),
          rows_imported: Math.ceil(stAmount / 180),
          rows_failed: 0,
          status: 'done',
          imported_by: 'Demo',
        })
        .select()
        .single();

      const count = Math.ceil(stAmount / 180);
      const perTx = stAmount / count;
      const txs = Array.from({ length: count }).map((_, i) => ({
        establishment_id: ESTABLISHMENT_ID,
        batch_id: batch.id,
        source: 'st_ingressos',
        amount: perTx.toFixed(2),
        payment_method: ['credit', 'debit', 'pix', 'cash'][i % 4],
        operator_id: ['op-marcos', 'op-julia', 'op-carla'][i % 3],
        occurred_at: new Date(Date.now() - (count - i) * 12 * 60000 - 2 * 3600000).toISOString(),
        imported_at: new Date().toISOString(),
      }));

      await supabase.from('transactions').insert(txs);
      addLog(`✓ ${count} transações registradas — Total: R$ ${stAmount.toFixed(2)} (ST Ingressos)`, 'success');
      await setStep('st', 'done');
      setCompletedSteps(prev => new Set(prev).add('st'));
    } catch (e: any) {
      addLog(`Erro: ${e.message}`, 'error');
      await setStep('st', 'error');
    }
  }

  async function simulatePagbank() {
    await setStep('pagbank', 'loading');
    addLog(`Importando ${Math.ceil(pagbankAmount / 150)} transações do PagBank...`, 'info');
    try {
      const { data: batch } = await supabase
        .from('import_batches')
        .insert({
          establishment_id: ESTABLISHMENT_ID,
          source: 'pagbank',
          filename: `PAGBANK_EXTRATO_DEMO_${Date.now()}.csv`,
          rows_total: Math.ceil(pagbankAmount / 150),
          rows_imported: Math.ceil(pagbankAmount / 150),
          rows_failed: 0,
          status: 'done',
          imported_by: 'Demo',
        })
        .select()
        .single();

      const count = Math.ceil(pagbankAmount / 150);
      const perTx = pagbankAmount / count;
      const txs = Array.from({ length: count }).map((_, i) => ({
        establishment_id: ESTABLISHMENT_ID,
        batch_id: batch.id,
        source: 'pagbank',
        amount: perTx.toFixed(2),
        payment_method: ['credit', 'debit', 'pix'][i % 3],
        operator_id: ['op-marcos', 'op-carla'][i % 2],
        occurred_at: new Date(Date.now() - (count - i) * 15 * 60000 - 2 * 3600000).toISOString(),
        imported_at: new Date().toISOString(),
      }));

      await supabase.from('transactions').insert(txs);
      addLog(`✓ ${count} transações registradas — Total: R$ ${pagbankAmount.toFixed(2)} (PagBank)`, 'success');

      const gap = Math.abs(stAmount - pagbankAmount);
      if (gap > 200) {
        addLog(`⚡ Gap detectado: R$ ${gap.toFixed(2)} entre ST Ingressos e PagBank`, 'alert');
      }

      await setStep('pagbank', 'done');
      setCompletedSteps(prev => new Set(prev).add('pagbank'));
    } catch (e: any) {
      addLog(`Erro: ${e.message}`, 'error');
      await setStep('pagbank', 'error');
    }
  }

  async function simulateCamera() {
    await setStep('camera', 'loading');
    addLog(`Câmera registrando ${people} pessoas no salão...`, 'info');
    try {
      await supabase.from('people_count_events').insert({
        establishment_id: ESTABLISHMENT_ID,
        camera_id: 'cam-entrada',
        count_in: people + 10,
        count_out: 10,
        people_inside: people,
        recorded_at: new Date().toISOString(),
      });

      addLog(`✓ Câmera: ${people} pessoas confirmadas no salão`, 'success');
      await setStep('camera', 'done');
      setCompletedSteps(prev => new Set(prev).add('camera'));
    } catch (e: any) {
      addLog(`Erro: ${e.message}`, 'error');
      await setStep('camera', 'error');
    }
  }

  async function simulateCashPayment() {
    await setStep('cash', 'loading');
    addLog('Câmera no caixa detectando pagamento em espécie...', 'info');
    try {
      await dataService.addCashPaymentEvent({
        cameraId: 'cam-caixa',
        detectedAt: new Date().toISOString(),
        windowMinutes: 15,
      });
      addLog('✓ Câmera: cédula detectada — evento registrado sem lançamento no ST Ingressos', 'alert');
      addLog('⚡ R05 será verificado na próxima execução do motor de regras', 'info');
      await setStep('cash', 'done');
      setCompletedSteps(prev => new Set(prev).add('cash'));
    } catch (e: any) {
      addLog(`Erro: ${e.message}`, 'error');
      await setStep('cash', 'error');
    }
  }

  async function runRules() {
    await setStep('rules', 'loading');
    addLog('Executando motor de regras antifraude...', 'info');
    try {
      const { data, error } = await supabase.rpc('run_fraud_rules', {
        p_establishment_id: ESTABLISHMENT_ID,
      });
      if (error) throw error;

      const result = data as StepResult['alerts'];
      if (!result || result.length === 0) {
        addLog('Motor executado — nenhuma nova anomalia detectada.', 'info');
      } else {
        result.forEach((r: any) => {
          addLog(`🚨 ALERTA DISPARADO: ${r.description}`, 'alert');
        });
        addLog(`${result.length} alerta(s) criado(s) — verifique a aba ALERTAS DE FRAUDE`, 'alert');
      }

      await setStep('rules', 'done');
      setCompletedSteps(prev => new Set(prev).add('rules'));
    } catch (e: any) {
      addLog(`Erro: ${e.message}`, 'error');
      await setStep('rules', 'error');
    }
  }

  const gap = Math.abs(stAmount - pagbankAmount);
  const gapIsHigh = gap > 200;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text uppercase tracking-tight">Simulador Interativo</h2>
          <p className="text-text-dim text-sm">Acione cada evento e veja o sistema reagir em tempo real.</p>
        </div>
        <button
          onClick={resetDemo}
          className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded text-[11px] font-black uppercase tracking-widest text-text-dim hover:text-danger hover:border-danger/40 transition-all"
        >
          <Trash2 size={14} />
          Reset Demo
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Painel de Controles */}
        <div className="lg:col-span-3 space-y-4">

          {/* Configuração dos valores */}
          <div className="bg-surface border border-border rounded-lg p-6 space-y-5">
            <h3 className="text-[11px] uppercase font-black tracking-widest text-text-dim">
              1. Configure o Cenário
            </h3>

            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="text-[12px] font-bold text-text uppercase tracking-wider flex items-center gap-2">
                  <Users size={14} className="text-primary" /> Pessoas no Salão (câmera)
                </label>
                <span className="font-mono font-black text-primary">{people}</span>
              </div>
              <input type="range" min={10} max={150} value={people}
                onChange={e => setPeople(Number(e.target.value))}
                className="w-full accent-primary" />
              <p className="text-[10px] text-text-dim">R01 dispara se &gt;30 pessoas sem vendas nos últimos 30 min</p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="text-[12px] font-bold text-text uppercase tracking-wider flex items-center gap-2">
                  <ShoppingBag size={14} className="text-primary" /> Total ST Ingressos (consumo)
                </label>
                <span className="font-mono font-black text-text">R$ {stAmount.toFixed(2)}</span>
              </div>
              <input type="range" min={200} max={5000} step={50} value={stAmount}
                onChange={e => setStAmount(Number(e.target.value))}
                className="w-full accent-primary" />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="text-[12px] font-bold text-text uppercase tracking-wider flex items-center gap-2">
                  <CreditCard size={14} className="text-primary" /> Total PagBank (maquineta)
                </label>
                <span className="font-mono font-black text-text">R$ {pagbankAmount.toFixed(2)}</span>
              </div>
              <input type="range" min={200} max={5000} step={50} value={pagbankAmount}
                onChange={e => setPagbankAmount(Number(e.target.value))}
                className="w-full accent-primary" />
            </div>

            {/* Gap preview */}
            <div className={cn(
              "flex items-center justify-between p-3 rounded border text-sm font-mono font-black transition-all",
              gapIsHigh
                ? "bg-danger/10 border-danger/30 text-danger"
                : "bg-success/10 border-success/30 text-success"
            )}>
              <span className="text-[10px] uppercase tracking-widest">Gap Financeiro (R02)</span>
              <span>R$ {gap.toFixed(2)} {gapIsHigh ? '⚠ FRAUDE' : '✓ OK'}</span>
            </div>
          </div>

          {/* Steps */}
          <div className="bg-surface border border-border rounded-lg p-6 space-y-3">
            <h3 className="text-[11px] uppercase font-black tracking-widest text-text-dim mb-4">
              2. Execute os Eventos (em ordem)
            </h3>

            <Step
              id="st"
              number={1}
              label="Importar ST Ingressos"
              description={`Registra R$ ${stAmount.toFixed(2)} em consumo no sistema de pedidos`}
              icon={ShoppingBag}
              status={stepStatus['st'] || 'idle'}
              done={completedSteps.has('st')}
              onClick={simulateSTIngressos}
            />

            <Step
              id="pagbank"
              number={2}
              label="Importar PagBank"
              description={`Registra R$ ${pagbankAmount.toFixed(2)} na maquineta de cartão`}
              icon={CreditCard}
              status={stepStatus['pagbank'] || 'idle'}
              done={completedSteps.has('pagbank')}
              onClick={simulatePagbank}
            />

            <Step
              id="camera"
              number={3}
              label="Acionar Câmera"
              description={`Registra ${people} pessoas no salão agora`}
              icon={Users}
              status={stepStatus['camera'] || 'idle'}
              done={completedSteps.has('camera')}
              onClick={simulateCamera}
            />

            <Step
              id="cash"
              number={4}
              label="Câmera Detecta Espécie"
              description="Simula câmera no caixa identificando pagamento em dinheiro sem lançamento no ST"
              icon={Banknote}
              status={stepStatus['cash'] || 'idle'}
              done={completedSteps.has('cash')}
              onClick={simulateCashPayment}
            />

            <Step
              id="rules"
              number={5}
              label="Executar Motor de Regras"
              description="Cruza todos os dados e gera alertas (R01, R02, R05)"
              icon={PlayCircle}
              status={stepStatus['rules'] || 'idle'}
              done={completedSteps.has('rules')}
              onClick={runRules}
              highlight
            />

            {completedSteps.has('rules') && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 p-4 bg-primary/10 border border-primary/30 rounded text-primary"
              >
                <Bell size={16} />
                <div>
                  <p className="text-[12px] font-black uppercase tracking-widest">Próximo passo</p>
                  <p className="text-[11px] font-medium mt-0.5">Abra a aba <strong>Alertas de Fraude</strong> para ver os alertas gerados</p>
                </div>
                <ChevronRight size={16} className="ml-auto" />
              </motion.div>
            )}
          </div>
        </div>

        {/* Log em tempo real */}
        <div className="lg:col-span-2 bg-surface border border-border rounded-lg flex flex-col">
          <div className="p-4 border-b border-border">
            <h3 className="text-[11px] uppercase font-black tracking-widest text-text-dim">Log em Tempo Real</h3>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-2 font-mono text-[11px] min-h-[400px]">
            {log.length === 0 ? (
              <p className="text-text-dim text-center pt-8">Aguardando eventos...</p>
            ) : (
              <AnimatePresence>
                {log.map((entry, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      "flex gap-2 leading-relaxed",
                      entry.type === 'success' && "text-success",
                      entry.type === 'alert'   && "text-danger font-black",
                      entry.type === 'error'   && "text-danger",
                      entry.type === 'info'    && "text-text-dim",
                    )}
                  >
                    <span className="text-text-dim shrink-0">{entry.time}</span>
                    <span>{entry.message}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface StepProps {
  id: string;
  number: number;
  label: string;
  description: string;
  icon: React.ElementType;
  status: StepStatus;
  done: boolean;
  onClick: () => void;
  highlight?: boolean;
}

function Step({ number, label, description, icon: Icon, status, done, onClick, highlight }: StepProps) {
  const loading = status === 'loading';
  return (
    <motion.button
      onClick={onClick}
      disabled={loading}
      whileHover={{ x: 2 }}
      className={cn(
        "w-full flex items-center gap-4 p-4 rounded border text-left transition-all",
        done
          ? "bg-success/5 border-success/20"
          : highlight
            ? "bg-primary/5 border-primary/30 hover:bg-primary/10"
            : "bg-surface-alt border-border hover:border-primary/30",
        loading && "opacity-70 cursor-wait"
      )}
    >
      <div className={cn(
        "w-8 h-8 rounded flex items-center justify-center shrink-0 text-[11px] font-black",
        done ? "bg-success text-white" : highlight ? "bg-primary text-white" : "bg-surface border border-border text-text-dim"
      )}>
        {loading ? <Loader2 size={14} className="animate-spin" />
          : done ? <CheckCircle2 size={14} />
            : <span>{number}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Icon size={13} className={done ? "text-success" : highlight ? "text-primary" : "text-text-dim"} />
          <p className={cn("text-[12px] font-black uppercase tracking-wider", done ? "text-success" : "text-text")}>{label}</p>
        </div>
        <p className="text-[10px] text-text-dim mt-0.5">{description}</p>
      </div>
      {!done && !loading && (
        <AlertTriangle size={14} className={highlight ? "text-primary" : "text-text-dim"} />
      )}
    </motion.button>
  );
}
