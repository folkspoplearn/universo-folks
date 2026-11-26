'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Grade, Page, RolloverResult, SchoolGrade } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, Card, Empty, ErrorBox, Loading, Stat } from '../ui';
import { DataTable, Modal, SectionTitle, SelectInput, TextInput, useAction, useConfirm } from '../admin';
import type { CompanyPlanet, Member } from '../company/types';
import { ClassReportView, CsvButton, GRADE_OPTIONS, Hint } from './common';

const useStructure = (tenantId: string) => {
  const { api } = useSession();
  return useQuery({ queryKey: ['company', tenantId, 'school', 'structure'], queryFn: () => api.company(tenantId).school.structure() });
};
const usePlanets = (tenantId: string) => {
  const { api } = useSession();
  return useQuery({ queryKey: ['company', tenantId, 'planets'], queryFn: () => api.http.get<CompanyPlanet[]>(`/companies/${tenantId}/planets`) });
};
const useMembers = (tenantId: string) => {
  const { api } = useSession();
  // escola pode passar de 200 alunos (limite por página da API): busca todas as páginas
  return useQuery({
    queryKey: ['company', tenantId, 'members', 'all'],
    queryFn: async () => {
      const items: Member[] = [];
      for (let page = 1; page <= 50; page++) {
        const r = await api.http.get<Page<Member>>(`/companies/${tenantId}/members`, { pageSize: 200, page });
        items.push(...r.items);
        if (page >= (r.totalPages ?? 1)) break;
      }
      return { items };
    },
  });
};
/** Matérias liberadas para uma turma (planetas da escola liberados para todos ou para ela). */
const subjectsOf = (planets: CompanyPlanet[] | undefined, classId: string) =>
  (planets ?? []).filter((p) => p.enabled && (p.allDepartments || p.departments.some((d) => d.id === classId))).map((p) => p.planet);

// ================================================================ turmas
/** Séries e turmas da escola: criar turma, ver professores e abrir o relatório. */
export function SchoolClasses({ tenantId }: { tenantId: string }) {
  const { api } = useSession();
  const q = useStructure(tenantId);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<{ grade: Grade | ''; suffix: string }>({ grade: '', suffix: '' });
  const key = [['company', tenantId]];
  const create = useAction(() => api.company(tenantId).school.createClass(f.grade as Grade, f.suffix.trim()), {
    success: (r) => `Turma ${r.name} criada · ${r.subjectsReleased} matéria(s) liberada(s)`,
    invalidate: key,
    onDone: () => { setOpen(false); setF({ grade: '', suffix: '' }); },
  });
  const sync = useAction(() => api.company(tenantId).school.syncSubjects(), { success: (r) => `Matérias conferidas: ${r.released} liberação(ões) nova(s)`, invalidate: key });

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const grades = q.data!;
  return (
    <>
      <Hint>Cada turma recebe as matérias da sua série automaticamente. Depois de criar as turmas, cadastre os alunos em <b>Pessoas</b> escolhendo a turma, e ligue os professores em <b>Professores</b>.</Hint>
      <div className="mb-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" loading={sync.isPending} onClick={() => sync.mutate(undefined)}>Atualizar matérias das turmas</Button>
        <Button onClick={() => setOpen(true)}>+ Nova turma</Button>
      </div>
      {!grades.length && <Empty title="Nenhuma turma ainda">Crie a primeira turma, por exemplo 1º ano A.</Empty>}
      <div className="flex flex-col gap-5">
        {grades.map((g) => <GradeBlock key={g.grade} grade={g} />)}
      </div>
      <Modal open={open} title="Nova turma" onClose={() => setOpen(false)}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button loading={create.isPending} disabled={!f.grade || !f.suffix.trim()} onClick={() => create.mutate(undefined)}>Criar turma</Button></>}>
        <div className="flex flex-col gap-4">
          <SelectInput label="Série" value={f.grade} placeholder="Escolha a série" onChange={(v) => setF({ ...f, grade: v })} options={GRADE_OPTIONS} />
          <TextInput label="Nome da turma" placeholder="A, B, Manhã…" value={f.suffix} onChange={(v) => setF({ ...f, suffix: v })}
            hint={f.grade && f.suffix.trim() ? `Vai se chamar: ${GRADE_OPTIONS.find((o) => o.value === f.grade)?.label} ${f.suffix.trim()}` : undefined} />
        </div>
      </Modal>
    </>
  );
}

function GradeBlock({ grade }: { grade: SchoolGrade }) {
  return (
    <Card>
      <SectionTitle>{grade.label}</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {grade.classes.map((c) => (
          <Link key={c.id} href={`/empresa/turmas/${c.id}`} className="rounded-2xl border border-line bg-bg-2/60 p-4 hover:border-amber">
            <div className="font-extrabold">{c.name}</div>
            <div className="mt-1 text-sm text-muted">{c.students} aluno(s)</div>
            <div className="mt-2 text-xs text-dim">
              {c.teachers.length ? c.teachers.map((t) => `${t.name} · ${t.planet.name}`).join(' — ') : 'Sem professor ligado'}
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

/** Relatório de uma turma visto pelo administrador (escolhe a matéria). */
export function SchoolClassReport({ tenantId, classId }: { tenantId: string; classId: string }) {
  const { api } = useSession();
  const st = useStructure(tenantId);
  const planets = usePlanets(tenantId);
  const subjects = useMemo(() => subjectsOf(planets.data, classId), [planets.data, classId]);
  const [planetId, setPlanetId] = useState('');
  const pid = planetId || subjects[0]?.id || '';
  const rep = useQuery({ queryKey: ['company', tenantId, 'school', 'report', classId, pid], queryFn: () => api.company(tenantId).school.report(classId, pid), enabled: !!pid });
  const cls = st.data?.flatMap((g) => g.classes).find((c) => c.id === classId);
  if (st.isLoading || planets.isLoading) return <Loading />;
  if (!cls) return <Empty title="Turma não encontrada" />;
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[240px]">
          <SelectInput label="Matéria" value={pid} onChange={setPlanetId} options={subjects.map((p) => ({ value: p.id, label: p.name }))} placeholder="Escolha a matéria" />
        </div>
        {pid && <CsvButton path={api.company(tenantId).school.reportCsvPath(classId, pid)} filename={`relatorio-${cls.name}.csv`} />}
      </div>
      {!subjects.length && <Empty title="Nenhuma matéria liberada para esta turma">Use “Atualizar matérias das turmas” em Turmas.</Empty>}
      {rep.isLoading && <Loading />}
      {rep.error && <ErrorBox error={rep.error} onRetry={() => rep.refetch()} />}
      {rep.data && <ClassReportView report={rep.data} />}
    </>
  );
}

// ============================================================ professores
/** Professores da escola e as turmas e matérias de cada um. */
export function SchoolTeachers({ tenantId }: { tenantId: string }) {
  const members = useMembers(tenantId);
  const [editing, setEditing] = useState<Member | null>(null);
  if (members.isLoading) return <Loading />;
  if (members.error) return <ErrorBox error={members.error} onRetry={() => members.refetch()} />;
  const teachers = members.data!.items.filter((m) => m.role === 'PROFESSOR' && m.status !== 'DISABLED');
  return (
    <>
      <Hint>Para cadastrar um professor, vá em <b>Pessoas</b> e escolha o papel <b>Professor</b>. Aqui você define em quais turmas e matérias ele dá aula: ele só verá esses alunos.</Hint>
      <DataTable rows={teachers} rowKey={(m) => m.membershipId} minWidth={560} empty="Nenhum professor cadastrado ainda."
        columns={[
          { key: 'n', label: 'Professor', render: (m) => <div><div className="font-bold">{m.user.name}</div><div className="text-xs text-dim">{m.user.email}</div></div> },
          { key: 't', label: 'Turmas e matérias', render: (m) => <TeachingSummary tenantId={tenantId} membershipId={m.membershipId} /> },
          { key: 'a', label: '', className: 'text-right', render: (m) => <button className="text-sm font-bold text-amber" onClick={() => setEditing(m)}>Editar turmas</button> },
        ]} />
      {editing && <TeachingModal tenantId={tenantId} teacher={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function useTeaching(tenantId: string, membershipId: string) {
  const { api } = useSession();
  return useQuery({ queryKey: ['company', tenantId, 'school', 'teaching', membershipId], queryFn: () => api.company(tenantId).school.teaching(membershipId) });
}

function TeachingSummary({ tenantId, membershipId }: { tenantId: string; membershipId: string }) {
  const q = useTeaching(tenantId, membershipId);
  if (q.isLoading) return <span className="text-dim">…</span>;
  if (!q.data?.length) return <span className="text-dim">Nenhuma ainda</span>;
  return <span className="text-sm text-muted">{q.data.map((t) => `${t.department.name} · ${t.planet.name}`).join(' — ')}</span>;
}

function TeachingModal({ tenantId, teacher, onClose }: { tenantId: string; teacher: Member; onClose: () => void }) {
  const { api } = useSession();
  const current = useTeaching(tenantId, teacher.membershipId);
  const st = useStructure(tenantId);
  const planets = usePlanets(tenantId);
  const [items, setItems] = useState<Array<{ departmentId: string; planetId: string }> | null>(null);
  const [cls, setCls] = useState('');
  const [planet, setPlanet] = useState('');
  const list = items ?? current.data?.map((t) => ({ departmentId: t.department.id, planetId: t.planet.id })) ?? [];
  const classes = st.data?.flatMap((g) => g.classes) ?? [];
  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? '?';
  const planetName = (id: string) => planets.data?.find((p) => p.planet.id === id)?.planet.name ?? '?';
  const save = useAction(() => api.company(tenantId).school.setTeaching(teacher.membershipId, list), { success: 'Turmas do professor salvas', invalidate: [['company', tenantId]], onDone: onClose });
  const add = () => {
    if (!cls || !planet || list.some((i) => i.departmentId === cls && i.planetId === planet)) return;
    setItems([...list, { departmentId: cls, planetId: planet }]);
    setPlanet('');
  };
  return (
    <Modal open title={`Turmas de ${teacher.user.name}`} onClose={onClose} wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={save.isPending} onClick={() => save.mutate(undefined)}>Salvar</Button></>}>
      {current.isLoading || st.isLoading || planets.isLoading ? <Loading /> : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <SelectInput label="Turma" value={cls} placeholder="Escolha" onChange={(v) => { setCls(v); setPlanet(''); }} options={classes.map((c) => ({ value: c.id, label: c.name }))} />
            <SelectInput label="Matéria" value={planet} placeholder={cls ? 'Escolha' : 'Escolha a turma antes'} onChange={setPlanet}
              options={cls ? subjectsOf(planets.data, cls).map((p) => ({ value: p.id, label: p.name })) : []} />
            <Button variant="ghost" disabled={!cls || !planet} onClick={add}>Adicionar</Button>
          </div>
          {!list.length && <p className="text-sm text-dim">Nenhuma turma ligada.</p>}
          <ul className="flex flex-col gap-2">
            {list.map((i) => (
              <li key={`${i.departmentId}|${i.planetId}`} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm">
                <span><b>{className(i.departmentId)}</b> · {planetName(i.planetId)}</span>
                <button className="font-bold text-red" onClick={() => setItems(list.filter((x) => x !== i))}>Tirar</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

// ========================================================== virada de ano
/** Virada do ano letivo: simula, marca quem repete e confirma. */
export function SchoolRollover({ tenantId }: { tenantId: string }) {
  const { api } = useSession();
  const st = useStructure(tenantId);
  const members = useMembers(tenantId);
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [plan, setPlan] = useState<RolloverResult | null>(null);
  const [ask, confirmNode] = useConfirm();
  const simulate = useAction(() => api.company(tenantId).school.rollover({ dryRun: true, keepBack: [...keep] }), { onDone: setPlan });
  const run = useAction(() => api.company(tenantId).school.rollover({ keepBack: [...keep] }), {
    success: (r) => `Ano virado: ${r.moved} aluno(s) subiram, ${r.kept} repetiram, ${r.graduated} se formaram`,
    invalidate: [['company', tenantId]],
    onDone: (r) => { setPlan(r); setKeep(new Set()); },
  });
  if (st.isLoading || members.isLoading) return <Loading />;
  if (st.error) return <ErrorBox error={st.error} onRetry={() => st.refetch()} />;
  const byClass = (classId: string) => (members.data?.items ?? []).filter((m) => m.role === 'COLABORADOR_CLIENTE' && m.status !== 'DISABLED' && m.departments.some((d) => d.id === classId));
  const toggle = (id: string) => { const n = new Set(keep); if (n.has(id)) n.delete(id); else n.add(id); setKeep(n); setPlan(null); };
  const classes = st.data!.flatMap((g) => g.classes);
  return (
    <>
      <Hint>Todas as turmas sobem para a série seguinte, com a mesma letra (1º ano A vira 2º ano A). Marque quem vai <b>repetir o ano</b>: essas pessoas ficam na turma atual. Os alunos da 3ª série do médio saem da turma (formados) e continuam ocupando licença até você removê-los em Pessoas.</Hint>
      {!classes.length && <Empty title="Nenhuma turma ainda" />}
      <div className="grid gap-4 md:grid-cols-2">
        {classes.map((c) => {
          const students = byClass(c.id);
          return (
            <Card key={c.id}>
              <SectionTitle>{c.name}</SectionTitle>
              {!students.length && <p className="text-sm text-dim">Sem alunos.</p>}
              <ul className="flex flex-col gap-1">
                {students.map((m) => (
                  <li key={m.membershipId}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" checked={keep.has(m.membershipId)} onChange={() => toggle(m.membershipId)} className="h-4 w-4 accent-[var(--color-amber)]" />
                      {m.user.name}{keep.has(m.membershipId) && <span className="text-xs font-bold text-amber">repete</span>}
                    </label>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" loading={simulate.isPending} onClick={() => simulate.mutate(undefined)}>Simular</Button>
        <Button loading={run.isPending} disabled={!plan?.dryRun} onClick={async () => {
          if (await ask({ title: 'Virar o ano agora?', text: `${plan?.moved ?? 0} aluno(s) vão subir de série, ${plan?.kept ?? 0} vão repetir e ${plan?.graduated ?? 0} vão se formar.`, confirm: 'Virar o ano' })) run.mutate(undefined);
        }}>Confirmar virada</Button>
      </div>
      {plan && (
        <Card className="mt-5">
          <SectionTitle>{plan.dryRun ? 'O que vai acontecer' : 'O que aconteceu'}</SectionTitle>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat label="Sobem" value={plan.moved} />
            <Stat label="Repetem" value={plan.kept} tone="blue" />
            <Stat label="Formados" value={plan.graduated} tone="green" />
          </div>
          <ul className="flex flex-col gap-1 text-sm">
            {plan.steps.filter((s) => s.move.length || s.keep.length).map((s) => (
              <li key={s.fromClassId}><b>{s.fromName}</b> → {s.toName ?? 'formados'} ({s.move.length}){s.keep.length ? ` · ${s.keep.length} repete(m)` : ''}</li>
            ))}
          </ul>
          {!plan.dryRun && plan.createdClasses?.length ? <p className="mt-3 text-sm text-muted">Turmas criadas: {plan.createdClasses.join(', ')}</p> : null}
          {plan.dryRun && <p className="mt-3 text-xs text-dim">Nada mudou ainda. Confira e clique em Confirmar virada.</p>}
        </Card>
      )}
      {confirmNode}
    </>
  );
}

// ============================================ transferências e responsáveis
/** Pedir transferência de um aluno e gerar o código do responsável. */
export function SchoolTransfers({ tenantId }: { tenantId: string }) {
  const { api } = useSession();
  const members = useMembers(tenantId);
  const [email, setEmail] = useState('');
  const [transferCode, setTransferCode] = useState<string | null>(null);
  const [student, setStudent] = useState('');
  const [guardianCode, setGuardianCode] = useState<string | null>(null);
  const transfer = useAction(() => api.company(tenantId).school.requestTransfer(email.trim()), { success: 'Pedido enviado para o e-mail do aluno', onDone: (r) => setTransferCode(r.code) });
  const code = useAction(() => api.company(tenantId).school.guardianCode(student), { onDone: (r) => setGuardianCode(r.code) });
  const students = (members.data?.items ?? []).filter((m) => m.role === 'COLABORADOR_CLIENTE' && m.status !== 'DISABLED');
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <SectionTitle>Receber aluno de outra escola</SectionTitle>
        <p className="mb-4 text-sm text-muted">O aluno recebe um código por e-mail e aceita no app. Ele traz todo o histórico. A licença da sua escola só é usada quando ele aceitar.</p>
        <div className="flex flex-col gap-3">
          <TextInput label="E-mail do aluno" type="email" value={email} onChange={(v) => { setEmail(v); setTransferCode(null); }} />
          <div><Button loading={transfer.isPending} disabled={!email.includes('@')} onClick={() => transfer.mutate(undefined)}>Pedir transferência</Button></div>
          {transferCode && <CodeBox code={transferCode} text="Se o e-mail não chegar, passe este código ao aluno (vale 14 dias). Ele só funciona na conta dele." />}
        </div>
      </Card>
      <Card>
        <SectionTitle>Código para o responsável</SectionTitle>
        <p className="mb-4 text-sm text-muted">O pai, a mãe ou o responsável usa este código no app para acompanhar o aluno e dar as autorizações. Vale 30 dias.</p>
        <div className="flex flex-col gap-3">
          <SelectInput label="Aluno" value={student} placeholder={members.isLoading ? 'Carregando…' : 'Escolha o aluno'} onChange={(v) => { setStudent(v); setGuardianCode(null); }}
            options={students.map((m) => ({ value: m.membershipId, label: `${m.user.name}${m.departments.length ? ` · ${m.departments.map((d) => d.name).join(', ')}` : ''}` }))} />
          <div><Button loading={code.isPending} disabled={!student} onClick={() => code.mutate(undefined)}>Gerar código</Button></div>
          {guardianCode && <CodeBox code={guardianCode} text="Entregue ao responsável junto com o comunicado da escola." />}
        </div>
      </Card>
    </div>
  );
}

function CodeBox({ code, text }: { code: string; text: string }) {
  return (
    <div className="rounded-2xl border border-amber/40 bg-amber/10 p-4">
      <div className="select-all font-mono text-xl font-extrabold tracking-widest text-amber">{code}</div>
      <p className="mt-1 text-xs text-muted">{text}</p>
    </div>
  );
}

// ============================================================== secretaria
/** Visão da rede de ensino (secretaria de educação). */
export function NetworkOverviewView({ tenantId }: { tenantId: string }) {
  const { api } = useSession();
  const q = useQuery({ queryKey: ['company', tenantId, 'network'], queryFn: () => api.company(tenantId).network() });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const n = q.data!;
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Escolas" value={n.totals.schools} />
        <Stat label="Alunos" value={n.totals.students} tone="blue" />
        <Stat label="Professores" value={n.totals.teachers} tone="purple" />
        <Stat label="Ativos na semana" value={n.totals.activeLast7Days} tone="green" />
      </div>
      <DataTable rows={n.schools} rowKey={(s) => s.id} minWidth={680} empty="Nenhuma escola ligada a esta rede ainda. Peça à Folks para ligar as escolas."
        columns={[
          { key: 'n', label: 'Escola', render: (s) => <span className="font-bold">{s.name}</span> },
          { key: 'a', label: 'Alunos', render: (s) => s.students },
          { key: 't', label: 'Professores', render: (s) => s.teachers },
          { key: 'w', label: 'Ativos na semana', render: (s) => s.activeLast7Days },
          { key: 'p', label: 'Progresso nas tarefas', render: (s) => `${s.avgTaskProgressPct}%` },
          { key: 'l', label: 'Alunos atrasados', render: (s) => <span className={s.studentsLate ? 'font-bold text-red' : ''}>{s.studentsLate}</span> },
        ]} />
    </>
  );
}
