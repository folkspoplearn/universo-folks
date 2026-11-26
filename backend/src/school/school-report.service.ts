import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';
import { dayInTz } from '../common/utils';
import { toCsv } from '../companies/insights.service';
import { TaskState, gradeLabel, isGrade, taskState } from './school-rules';

const TZ = 'America/Sao_Paulo';
const iso = (d: Date) => d.toISOString().slice(0, 10);
const br = (d: string | null) => (d ? d.split('-').reverse().join('/') : '');

export interface TeacherScope {
  tenantId: string;
  membershipId: string;
  /** pares turma × matéria que o professor ensina */
  pairs: { departmentId: string; planetId: string }[];
}

export interface ReportTask {
  assignmentId: string;
  title: string;
  kind: 'HOMEWORK' | 'STUDY';
  dueDate: string | null;
  courseIds: string[];
}

export interface StudentRow {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  invited: boolean;
  /** progresso médio nos cursos da matéria (0..100) */
  progressPct: number;
  courses: Record<string, number>;
  practice: { attempts: number; avgScorePct: number | null };
  tasks: { assignmentId: string; progressPct: number; state: TaskState }[];
  pendingTasks: number;
  lateTasks: number;
  lastActivity: string | null;
}

/**
 * Escopo do professor e relatório por turma e matéria (ADR 0020).
 * Ponto único: toda rota do professor passa por `scope()` e por `assertPair()`.
 */
@Injectable()
export class SchoolReportService {
  constructor(private readonly prisma: PrismaService) {}

  /** Escopo do professor logado. O tenant vem do token, nunca do cliente. */
  async scope(user: AuthUser): Promise<TeacherScope> {
    if (user.mode !== 'TENANT' || user.tenantRole !== 'PROFESSOR' || !user.tenantId || !user.membershipId) {
      throw new ForbiddenException('Ação exclusiva de professores');
    }
    const m = await this.prisma.membership.findFirst({
      where: { id: user.membershipId, tenantId: user.tenantId, role: 'PROFESSOR', status: 'ACTIVE' },
      select: { id: true, teaching: { select: { departmentId: true, planetId: true } } },
    });
    if (!m) throw new ForbiddenException('Seu acesso de professor não está ativo nesta escola');
    return { tenantId: user.tenantId, membershipId: m.id, pairs: m.teaching };
  }

  teaches(s: TeacherScope, departmentId: string, planetId?: string) {
    return s.pairs.some((p) => p.departmentId === departmentId && (!planetId || p.planetId === planetId));
  }

  assertPair(s: TeacherScope, departmentId: string, planetId?: string) {
    if (!this.teaches(s, departmentId, planetId)) {
      throw new ForbiddenException(planetId ? 'Você não ensina essa matéria nessa turma' : 'Você não dá aula nessa turma');
    }
  }

  /** Alunos (vínculos ativos ou convidados) de uma turma. */
  students(tenantId: string, classId: string) {
    return this.prisma.membership.findMany({
      where: { tenantId, role: 'COLABORADOR_CLIENTE', status: { in: ['ACTIVE', 'INVITED'] }, departments: { some: { departmentId: classId } } },
      include: { user: { select: { id: true, name: true, email: true, devices: { select: { token: true } } } } },
      orderBy: { user: { name: 'asc' } },
    });
  }

  async assertClass(tenantId: string, classId: string) {
    const c = await this.prisma.department.findFirst({ where: { id: classId, tenantId, kind: 'CLASS' } });
    if (!c) throw new NotFoundException('Turma não encontrada nesta escola');
    return c;
  }

  /** Tarefas de uma turma, opcionalmente só de algumas matérias. */
  async tasks(tenantId: string, classId: string, planetIds?: string[]): Promise<ReportTask[]> {
    const rows = await this.prisma.assignment.findMany({
      where: {
        tenantId,
        departmentId: classId,
        ...(planetIds ? { OR: [{ planetId: { in: planetIds } }, { course: { planetId: { in: planetIds } } }] } : {}),
      },
      include: {
        course: { select: { id: true, title: true } },
        planet: { select: { name: true, courses: { where: { status: 'PUBLISHED' }, select: { id: true } } } },
      },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    return rows.map((a) => ({
      assignmentId: a.id,
      title: a.course?.title ?? a.planet?.name ?? '',
      kind: a.mandatory ? 'HOMEWORK' : 'STUDY',
      dueDate: a.dueDate ? iso(a.dueDate) : null,
      courseIds: a.courseId ? [a.courseId] : a.planet?.courses.map((c) => c.id) ?? [],
    }));
  }

  /** Relatório de uma turma numa matéria: progresso por curso, prática, tarefas e última atividade. */
  async classReport(tenantId: string, classId: string, planetId: string) {
    const cls = await this.assertClass(tenantId, classId);
    const planet = await this.prisma.planet.findUnique({
      where: { id: planetId },
      select: { id: true, name: true, courses: { where: { status: 'PUBLISHED' }, orderBy: { sortOrder: 'asc' }, select: { id: true, title: true } } },
    });
    if (!planet) throw new BadRequestException('Matéria não encontrada');
    const [members, tasks] = await Promise.all([this.students(tenantId, classId), this.tasks(tenantId, classId, [planetId])]);
    const userIds = members.map((m) => m.userId);
    const courseIds = planet.courses.map((c) => c.id);
    const [enrollments, practice, last] = await Promise.all([
      this.prisma.enrollment.findMany({ where: { userId: { in: userIds }, courseId: { in: courseIds } }, select: { userId: true, courseId: true, progressPct: true } }),
      this.prisma.practiceAttempt.groupBy({ by: ['userId'], where: { userId: { in: userIds }, courseId: { in: courseIds } }, _count: true, _avg: { scorePct: true } }),
      this.prisma.activityEvent.groupBy({ by: ['userId'], where: { userId: { in: userIds } }, _max: { day: true } }),
    ]);
    const prog = new Map(enrollments.map((e) => [`${e.userId}|${e.courseId}`, e.progressPct]));
    const prac = new Map(practice.map((p) => [p.userId, p]));
    const lastDay = new Map(last.map((l) => [l.userId, l._max.day ? iso(l._max.day) : null]));
    const today = iso(dayInTz(new Date(), TZ));

    const students: StudentRow[] = members.map((m) => {
      const courses = Object.fromEntries(courseIds.map((id) => [id, prog.get(`${m.userId}|${id}`) ?? 0]));
      const progressPct = courseIds.length ? Math.round(courseIds.reduce((s, id) => s + courses[id], 0) / courseIds.length) : 0;
      const t = tasks.map((task) => {
        const p = task.courseIds.length ? task.courseIds.reduce((s, id) => s + (prog.get(`${m.userId}|${id}`) ?? 0), 0) / task.courseIds.length : 0;
        return { assignmentId: task.assignmentId, progressPct: Math.round(p), state: taskState(p / 100, task.dueDate, today) };
      });
      const pr = prac.get(m.userId);
      return {
        membershipId: m.id,
        userId: m.userId,
        name: m.user.name || m.user.email,
        email: m.user.email,
        invited: m.status === 'INVITED',
        progressPct,
        courses,
        practice: { attempts: pr?._count ?? 0, avgScorePct: pr?._avg.scorePct != null ? Math.round(pr._avg.scorePct) : null },
        tasks: t,
        pendingTasks: t.filter((x) => x.state !== 'DONE').length,
        lateTasks: t.filter((x) => x.state === 'LATE').length,
        lastActivity: lastDay.get(m.userId) ?? null,
      };
    });
    const withPractice = students.filter((s) => s.practice.avgScorePct != null);
    return {
      class: { id: cls.id, name: cls.name, grade: cls.grade, gradeLabel: isGrade(cls.grade) ? gradeLabel(cls.grade) : null },
      planet: { id: planet.id, name: planet.name },
      courses: planet.courses,
      tasks,
      summary: {
        students: students.length,
        avgProgressPct: students.length ? Math.round(students.reduce((s, x) => s + x.progressPct, 0) / students.length) : 0,
        avgPracticeScorePct: withPractice.length ? Math.round(withPractice.reduce((s, x) => s + (x.practice.avgScorePct ?? 0), 0) / withPractice.length) : null,
        withLateTasks: students.filter((s) => s.lateTasks > 0).length,
        neverStarted: students.filter((s) => !s.lastActivity).length,
      },
      students,
    };
  }

  /** O mesmo relatório em CSV (Excel em pt-BR). */
  async classReportCsv(tenantId: string, classId: string, planetId: string) {
    const r = await this.classReport(tenantId, classId, planetId);
    const label = (s: TaskState) => (s === 'DONE' ? 'concluída' : s === 'LATE' ? 'atrasada' : 'pendente');
    return toCsv([
      ['Relatório da turma', r.class.name, 'Matéria', r.planet.name],
      ['Gerado em', new Date().toLocaleDateString('pt-BR', { timeZone: TZ })],
      ['Alunos', r.summary.students, 'Progresso médio', `${r.summary.avgProgressPct}%`, 'Acerto médio nas práticas', r.summary.avgPracticeScorePct != null ? `${r.summary.avgPracticeScorePct}%` : '-'],
      [],
      [
        'Aluno', 'E-mail', 'Progresso na matéria', ...r.courses.map((c) => c.title), 'Práticas feitas', 'Acerto médio',
        ...r.tasks.map((t) => `${t.kind === 'HOMEWORK' ? 'Lição' : 'Estudo'}: ${t.title}${t.dueDate ? ` (prazo ${br(t.dueDate)})` : ''}`),
        'Última atividade',
      ],
      ...r.students.map((s) => [
        s.name, s.email, `${s.progressPct}%`, ...r.courses.map((c) => `${s.courses[c.id] ?? 0}%`), s.practice.attempts,
        s.practice.avgScorePct != null ? `${s.practice.avgScorePct}%` : '-',
        ...s.tasks.map((t) => label(t.state)),
        s.invited ? 'convite enviado' : br(s.lastActivity) || 'nunca',
      ]),
    ]);
  }
}
