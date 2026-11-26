'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import type { TaskKind, TeacherClass, TeacherTask } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, Card, Empty, ErrorBox, Loading } from '../ui';
import { DataTable, Modal, SectionTitle, SelectInput, TextArea, TextInput, useAction, useConfirm } from '../admin';
import { ClassReportView, CsvButton, Hint, fmtDate } from './common';

const useClasses = () => {
  const { api } = useSession();
  return useQuery({ queryKey: ['teacher', 'classes'], queryFn: () => api.teacher.classes() });
};

/** Minhas turmas: um cartão por turma × matéria. */
export function TeacherClasses() {
  const q = useClasses();
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const classes = q.data!;
  if (!classes.length) return <Empty title="Você ainda não tem turmas">Peça ao administrador da escola para ligar você às suas turmas e matérias.</Empty>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {classes.flatMap((c) => c.subjects.map((s) => (
        <Link key={`${c.id}|${s.id}`} href={`/professor/turma/${c.id}?materia=${s.id}`} className="rounded-[20px] border border-line bg-card/90 p-5 hover:border-amber">
          <div className="text-xs font-bold uppercase tracking-wide text-dim">{c.gradeLabel ?? 'Turma'}</div>
          <div className="mt-1 text-lg font-extrabold">{c.name}</div>
          <div className="mt-1 font-bold text-amber">{s.name}</div>
          <div className="mt-2 text-sm text-muted">{c.students} aluno(s)</div>
        </Link>
      )))}
    </div>
  );
}

/** Uma turma numa matéria: relatório, nova tarefa e cobrança. */
export function TeacherClassPage({ classId, planetId }: { classId: string; planetId: string }) {
  const { api } = useSession();
  const classes = useClasses();
  const rep = useQuery({ queryKey: ['teacher', 'report', classId, planetId], queryFn: () => api.teacher.report(classId, planetId), enabled: !!planetId });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [remindOpen, setRemindOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const cls = classes.data?.find((c) => c.id === classId);
  if (classes.isLoading || rep.isLoading) return <Loading />;
  if (rep.error) return <ErrorBox error={rep.error} onRetry={() => rep.refetch()} />;
  if (!cls || !rep.data) return <Empty title="Turma não encontrada nas suas turmas" />;
  const toggle = (id: string) => { const n = new Set(picked); if (n.has(id)) n.delete(id); else n.add(id); setPicked(n); };
  return (
    <>
      <div className="mb-5 flex flex-wrap justify-end gap-2">
        <CsvButton path={api.teacher.reportCsvPath(classId, planetId)} filename={`relatorio-${cls.name}-${rep.data.planet.name}.csv`} />
        <Button variant="ghost" onClick={() => setTaskOpen(true)}>+ Nova tarefa</Button>
        <Button onClick={() => setRemindOpen(true)}>{picked.size ? `Cobrar ${picked.size} aluno(s)` : 'Cobrar pendentes'}</Button>
      </div>
      <ClassReportView report={rep.data} picked={picked} onPick={toggle} />
      {taskOpen && <TaskModal classes={[cls]} fixed={{ classId, planetId }} onClose={() => setTaskOpen(false)} />}
      {remindOpen && <RemindModal classId={classId} planetId={planetId} membershipIds={[...picked]} onClose={() => { setRemindOpen(false); setPicked(new Set()); }} />}
    </>
  );
}

function RemindModal({ classId, planetId, membershipIds, onClose }: { classId: string; planetId: string; membershipIds: string[]; onClose: () => void }) {
  const { api } = useSession();
  const [message, setMessage] = useState('');
  const send = useAction(() => api.teacher.remind({ classId, planetId, membershipIds: membershipIds.length ? membershipIds : undefined, message: message.trim() || undefined }), {
    success: (r) => (r.sent ? `Recado enviado para ${r.sent} aluno(s)` : 'Ninguém para cobrar: todos estão em dia'),
    onDone: onClose,
  });
  return (
    <Modal open title="Cobrar alunos" onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={send.isPending} onClick={() => send.mutate(undefined)}>Enviar</Button></>}>
      <p className="mb-3 text-sm text-muted">
        {membershipIds.length ? `Vai para os ${membershipIds.length} aluno(s) marcados.` : 'Vai para todos com tarefa pendente ou atrasada nesta matéria.'} O aluno recebe um aviso no app e um e-mail, com a lista do que falta.
      </p>
      <TextArea label="Recado (opcional)" rows={3} value={message} onChange={setMessage} placeholder="Ex.: Pessoal, a lição vale ponto na prova!" />
    </Modal>
  );
}

/** Criar ou editar tarefa. `fixed`: turma e matéria já escolhidas. */
function TaskModal({ classes, fixed, task, onClose }: { classes: TeacherClass[]; fixed?: { classId: string; planetId: string }; task?: TeacherTask; onClose: () => void }) {
  const { api } = useSession();
  const [f, setF] = useState({
    classId: fixed?.classId ?? task?.class?.id ?? '',
    planetId: fixed?.planetId ?? task?.planetId ?? '',
    kind: (task?.kind ?? 'HOMEWORK') as TaskKind,
    open: task ? !task.dueDate : false,
    dueDate: task?.dueDate?.slice(0, 10) ?? '',
  });
  const subjects = classes.find((c) => c.id === f.classId)?.subjects ?? [];
  const dueDate = f.open || !f.dueDate ? null : f.dueDate;
  const save = useAction(
    () => (task ? api.teacher.updateTask(task.id, { kind: f.kind, dueDate }) : api.teacher.createTask({ classId: f.classId, planetId: f.planetId, kind: f.kind, dueDate })),
    { success: task ? 'Tarefa atualizada' : 'Tarefa passada para a turma', invalidate: [['teacher']], onDone: onClose },
  );
  return (
    <Modal open title={task ? 'Editar tarefa' : 'Nova tarefa'} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={save.isPending} disabled={!f.classId || !f.planetId || (!f.open && !f.dueDate && f.kind === 'HOMEWORK' && !task)} onClick={() => save.mutate(undefined)}>Salvar</Button></>}>
      <div className="flex flex-col gap-4">
        {!fixed && !task && (
          <>
            <SelectInput label="Turma" value={f.classId} placeholder="Escolha" onChange={(v) => setF({ ...f, classId: v, planetId: '' })} options={classes.map((c) => ({ value: c.id, label: c.name }))} />
            <SelectInput label="Matéria" value={f.planetId} placeholder={f.classId ? 'Escolha' : 'Escolha a turma antes'} onChange={(v) => setF({ ...f, planetId: v })} options={subjects.map((s) => ({ value: s.id, label: s.name }))} />
          </>
        )}
        <SelectInput label="Tipo" value={f.kind} onChange={(v) => setF({ ...f, kind: v })}
          options={[{ value: 'HOMEWORK', label: 'Lição de casa (obrigatória)' }, { value: 'STUDY', label: 'Só estudo (recomendado)' }]} />
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={f.open} onChange={(e) => setF({ ...f, open: e.target.checked })} className="h-4 w-4 accent-[var(--color-amber)]" />
          Sem prazo (em aberto)
        </label>
        {!f.open && <TextInput label="Prazo" type="date" value={f.dueDate} onChange={(v) => setF({ ...f, dueDate: v })} />}
      </div>
    </Modal>
  );
}

/** Todas as minhas tarefas: editar prazo, trocar o tipo ou apagar. */
export function TeacherTasks() {
  const { api } = useSession();
  const classes = useClasses();
  const tasks = useQuery({ queryKey: ['teacher', 'tasks'], queryFn: () => api.teacher.tasks() });
  const [edit, setEdit] = useState<TeacherTask | null>(null);
  const [creating, setCreating] = useState(false);
  const [ask, confirmNode] = useConfirm();
  const remove = useAction((id: string) => api.teacher.deleteTask(id), { success: 'Tarefa apagada', invalidate: [['teacher']] });
  if (classes.isLoading || tasks.isLoading) return <Loading />;
  if (tasks.error) return <ErrorBox error={tasks.error} onRetry={() => tasks.refetch()} />;
  const subjectName = (planetId: string | null) => classes.data?.flatMap((c) => c.subjects).find((s) => s.id === planetId)?.name ?? '';
  return (
    <>
      <Hint><b>Lição de casa</b> é obrigatória e entra como atrasada quando passa do prazo. <b>Só estudo</b> é uma recomendação. Sem prazo, a tarefa fica em aberto e nunca atrasa.</Hint>
      <div className="mb-4 flex justify-end"><Button disabled={!classes.data?.length} onClick={() => setCreating(true)}>+ Nova tarefa</Button></div>
      <DataTable rows={tasks.data!} rowKey={(t) => t.id} minWidth={640} empty="Nenhuma tarefa passada ainda."
        columns={[
          { key: 't', label: 'Tarefa', render: (t) => <div><div className="font-bold">{t.title}</div><div className="text-xs text-dim">{subjectName(t.planetId)}</div></div> },
          { key: 'c', label: 'Turma', render: (t) => t.class?.name ?? '' },
          { key: 'k', label: 'Tipo', render: (t) => (t.kind === 'HOMEWORK' ? 'Lição de casa' : 'Estudo') },
          { key: 'd', label: 'Prazo', render: (t) => (t.dueDate ? fmtDate(t.dueDate) : <span className="text-dim">em aberto</span>) },
          { key: 'a', label: '', className: 'text-right', render: (t) => (
            <div className="flex justify-end gap-3">
              <button className="text-sm font-bold text-amber" onClick={() => setEdit(t)}>Editar</button>
              <button className="text-sm font-bold text-red" onClick={async () => { if (await ask({ title: 'Apagar tarefa?', text: `"${t.title}" sai da lista dos alunos de ${t.class?.name}. O progresso deles não se perde.`, confirm: 'Apagar', danger: true })) remove.mutate(t.id); }}>Apagar</button>
            </div>
          ) },
        ]} />
      {(creating || edit) && <TaskModal classes={classes.data ?? []} task={edit ?? undefined} onClose={() => { setCreating(false); setEdit(null); }} />}
      {confirmNode}
    </>
  );
}

/** Resumo das turmas para a página inicial do professor. */
export function TeacherHome() {
  return (
    <>
      <Hint>Abra uma turma para ver o relatório dos alunos, passar tarefa e cobrar quem está pendente.</Hint>
      <TeacherClasses />
      <Card className="mt-6">
        <SectionTitle>Quer estudar também?</SectionTitle>
        <p className="text-sm text-muted">No app do Universo Folks você vê as aulas das matérias que ensina, do jeito que os alunos veem.</p>
      </Card>
    </>
  );
}
