/**
 * Regras puras da escola (ADR 0020): séries, nomes de turma e o plano da virada de ano.
 * Sem Prisma de propósito: testadas em school-rules.spec.ts sem banco.
 */

/** Séries na ordem do ano letivo: fundamental "1".."9" e médio "m1".."m3". */
export const GRADES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'm1', 'm2', 'm3'] as const;
export type Grade = (typeof GRADES)[number];

export const isGrade = (g: unknown): g is Grade => typeof g === 'string' && (GRADES as readonly string[]).includes(g);

/** "1" -> "1º ano"; "m2" -> "2ª série do médio". */
export function gradeLabel(g: Grade): string {
  return g.startsWith('m') ? `${g.slice(1)}ª série do médio` : `${g}º ano`;
}

/** Série seguinte; null na 3ª série do médio (formatura). */
export function nextGrade(g: Grade): Grade | null {
  const i = GRADES.indexOf(g);
  return i >= 0 && i < GRADES.length - 1 ? GRADES[i + 1] : null;
}

/** Nome da turma: "1º ano A". O sufixo é o que a escola usa (A, B, Manhã...). */
export function className(g: Grade, suffix: string): string {
  return `${gradeLabel(g)} ${suffix.trim()}`.trim();
}

/** Sufixo de uma turma a partir do nome ("1º ano A" -> "A"). Nome fora do padrão vira o próprio sufixo. */
export function classSuffix(g: Grade, name: string): string {
  const label = gradeLabel(g);
  const n = name.trim();
  return n.toLowerCase().startsWith(label.toLowerCase()) ? n.slice(label.length).trim() || n : n;
}

export interface RolloverClass {
  id: string;
  name: string;
  grade: Grade;
  /** alunos (vínculos) da turma */
  studentIds: string[];
}

export interface RolloverStep {
  fromClassId: string;
  fromName: string;
  fromGrade: Grade;
  /** null = formatura (3ª série do médio) */
  toGrade: Grade | null;
  toName: string | null;
  move: string[];
  keep: string[];
}

export interface RolloverPlan {
  steps: RolloverStep[];
  moved: number;
  kept: number;
  graduated: number;
}

/**
 * Plano da virada de ano. As turmas são processadas da série mais alta para a mais baixa,
 * para que ninguém seja promovido duas vezes na mesma virada.
 * `keepBack`: vínculos que repetem o ano (ficam na turma atual).
 */
export function planRollover(classes: RolloverClass[], keepBack: Iterable<string> = []): RolloverPlan {
  const keep = new Set(keepBack);
  const ordered = [...classes].sort((a, b) => GRADES.indexOf(b.grade) - GRADES.indexOf(a.grade) || a.name.localeCompare(b.name, 'pt-BR'));
  let moved = 0;
  let kept = 0;
  let graduated = 0;
  const steps = ordered.map((c) => {
    const to = nextGrade(c.grade);
    const move = c.studentIds.filter((id) => !keep.has(id));
    const stay = c.studentIds.filter((id) => keep.has(id));
    kept += stay.length;
    if (to) moved += move.length;
    else graduated += move.length;
    return {
      fromClassId: c.id,
      fromName: c.name,
      fromGrade: c.grade,
      toGrade: to,
      toName: to ? className(to, classSuffix(c.grade, c.name)) : null,
      move,
      keep: stay,
    };
  });
  return { steps, moved, kept, graduated };
}

// ------------------------------------------------------------ situação na tarefa
export type TaskState = 'DONE' | 'LATE' | 'PENDING';

/** Situação de um aluno numa tarefa: concluída, atrasada (prazo vencido) ou pendente. `today` e `due` em AAAA-MM-DD. */
export function taskState(progress: number, due: string | null, today: string): TaskState {
  if (progress >= 1) return 'DONE';
  if (due && due < today) return 'LATE';
  return 'PENDING';
}

// --------------------------------------------------------------- menores e ofertas
/** Idade completa em `on` (UTC). */
export function ageOn(birthDate: Date, on: Date = new Date()): number {
  let age = on.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = on.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < birthDate.getUTCDate())) age--;
  return age;
}

/**
 * Pode mostrar oferta de Premium para esta pessoa? (ADR 0020)
 * Nunca para quem está numa escola; nunca para criança (menos de 12 anos, Resolução 163 do Conanda).
 * Sem data de nascimento: não mostra (a data é obrigatória no cadastro B2C).
 */
export function offersAllowed(birthDate: Date | null, inSchool: boolean, on: Date = new Date()): boolean {
  if (inSchool || !birthDate) return false;
  return ageOn(birthDate, on) >= 12;
}

/** Versão atual do termo de consentimento do responsável. Mude quando o texto jurídico mudar. */
export const GUARDIAN_CONSENT_VERSION = '2026-11-26';
