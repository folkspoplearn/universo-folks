'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage, type ClassReport, type Grade, type TaskState } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, Card, Progress, Stat, cx } from '../ui';
import { DataTable, saveBlob, useToast } from '../admin';

/** Séries na ordem do ano letivo, com o nome que aparece na tela. */
export const GRADE_OPTIONS: Array<{ value: Grade; label: string }> = [
  ...(['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const).map((g) => ({ value: g, label: `${g}º ano` })),
  ...(['m1', 'm2', 'm3'] as const).map((g) => ({ value: g, label: `${g.slice(1)}ª série do médio` })),
];

/** Segmento do tenant do contexto atual: CORPORATE, SCHOOL ou SCHOOL_NETWORK (ADR 0020). */
export function useSegment(): string | null {
  const { api, context } = useSession();
  const q = useQuery({ queryKey: ['contexts'], queryFn: () => api.auth.contexts(), staleTime: 5 * 60_000, enabled: !!context?.tenantId });
  if (!context?.tenantId) return null;
  return q.data?.find((c) => c.tenantId === context.tenantId)?.tenantSegment ?? (q.isLoading ? null : 'CORPORATE');
}

const br = (d: string | null | undefined) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '');
export const fmtDate = br;

const STATE: Record<TaskState, { label: string; cls: string }> = {
  DONE: { label: 'Concluída', cls: 'bg-green/15 text-green' },
  LATE: { label: 'Atrasada', cls: 'bg-red/15 text-red' },
  PENDING: { label: 'Pendente', cls: 'bg-amber/15 text-amber' },
};
export function TaskStatePill({ state }: { state: TaskState }) {
  const s = STATE[state];
  return <span className={cx('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-extrabold', s.cls)}>{s.label}</span>;
}

/** Botão que baixa o relatório da turma em CSV (Excel). */
export function CsvButton({ path, filename }: { path: string; filename: string }) {
  const { api } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="ghost" loading={busy} onClick={async () => {
      setBusy(true);
      try { saveBlob(await api.download(path), filename); toast('Relatório baixado'); }
      catch (e) { toast(errorMessage(e), 'error'); }
      finally { setBusy(false); }
    }}>Baixar planilha (CSV)</Button>
  );
}

/**
 * Relatório de uma turma numa matéria (usado pelo professor e pelo administrador).
 * `onPick` permite selecionar alunos (para cobrar só alguns).
 */
export function ClassReportView({ report, picked, onPick }: { report: ClassReport; picked?: Set<string>; onPick?: (membershipId: string) => void }) {
  const s = report.summary;
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Alunos" value={s.students} />
        <Stat label="Progresso médio" value={`${s.avgProgressPct}%`} tone="amber" />
        <Stat label="Acerto nas práticas" value={s.avgPracticeScorePct != null ? `${s.avgPracticeScorePct}%` : '—'} tone="green" />
        <Stat label="Com lição atrasada" value={s.withLateTasks} tone={s.withLateTasks ? 'red' : undefined} hint={s.neverStarted ? `${s.neverStarted} nunca entraram` : undefined} />
      </div>
      <DataTable rows={report.students} rowKey={(r) => r.membershipId} minWidth={720} empty="Nenhum aluno nesta turma ainda."
        columns={[
          ...(onPick ? [{ key: 'sel', label: '', className: 'w-8', render: (r: ClassReport['students'][number]) => (
            <input type="checkbox" aria-label={`Selecionar ${r.name}`} checked={picked?.has(r.membershipId) ?? false} onChange={() => onPick(r.membershipId)} className="h-4 w-4 accent-[var(--color-amber)]" />
          ) }] : []),
          { key: 'n', label: 'Aluno', render: (r) => <div><div className="font-bold">{r.name}</div><div className="text-xs text-dim">{r.invited ? 'convite enviado' : r.email}</div></div> },
          { key: 'p', label: 'Progresso', render: (r) => <div className="w-28"><div className="mb-1 text-xs font-bold">{r.progressPct}%</div><Progress value={r.progressPct} /></div> },
          { key: 'q', label: 'Práticas', render: (r) => r.practice.attempts ? <span>{r.practice.avgScorePct}% <span className="text-xs text-dim">({r.practice.attempts})</span></span> : <span className="text-dim">—</span> },
          ...report.tasks.map((t) => ({
            key: t.assignmentId,
            label: `${t.kind === 'HOMEWORK' ? 'Lição' : 'Estudo'}: ${t.title}${t.dueDate ? ` · ${br(t.dueDate)}` : ''}`,
            render: (r: ClassReport['students'][number]) => {
              const x = r.tasks.find((y) => y.assignmentId === t.assignmentId);
              return x ? <TaskStatePill state={x.state} /> : null;
            },
          })),
          { key: 'l', label: 'Última atividade', render: (r) => <span className="text-muted">{r.lastActivity ? br(r.lastActivity) : 'nunca'}</span> },
        ]} />
    </>
  );
}

/** Caixa de explicação curta no topo das telas da escola. */
export function Hint({ children }: { children: React.ReactNode }) {
  return <Card className="mb-5 border-blue/30 bg-blue/5 p-4 text-sm text-muted">{children}</Card>;
}
