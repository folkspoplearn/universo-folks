import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';
import { AuditService } from '../audit/audit.service';
import { EmailService, templates } from '../email/email.service';
import { NoticesService } from './notices.service';
import { SchoolReportService } from './school-report.service';
import { TaskDto, TeacherRemindDto, UpdateTaskDto } from './school.dto';
import { gradeLabel, isGrade } from './school-rules';

const br = (d: string | null) => (d ? d.split('-').reverse().join('/') : null);
const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(v) : null);

/**
 * Área do professor (ADR 0020): minhas turmas, relatório, tarefas e cobrança.
 * Tudo restrito aos pares turma × matéria do TeachingAssignment do professor.
 */
@Injectable()
export class TeacherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly report: SchoolReportService,
    private readonly notices: NoticesService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  /** Minhas turmas, com as matérias que dou em cada uma e quantos alunos têm. */
  async classes(user: AuthUser) {
    const s = await this.report.scope(user);
    const classIds = [...new Set(s.pairs.map((p) => p.departmentId))];
    const [classes, planets] = await Promise.all([
      this.prisma.department.findMany({
        where: { id: { in: classIds }, tenantId: s.tenantId },
        orderBy: { name: 'asc' },
        include: { _count: { select: { members: { where: { membership: { role: 'COLABORADOR_CLIENTE', status: { in: ['ACTIVE', 'INVITED'] } } } } } } },
      }),
      this.prisma.planet.findMany({ where: { id: { in: [...new Set(s.pairs.map((p) => p.planetId))] } }, select: { id: true, name: true, grade: true } }),
    ]);
    const pName = new Map(planets.map((p) => [p.id, p]));
    return classes.map((c) => ({
      id: c.id,
      name: c.name,
      grade: c.grade,
      gradeLabel: isGrade(c.grade) ? gradeLabel(c.grade) : null,
      students: c._count.members,
      subjects: s.pairs.filter((p) => p.departmentId === c.id).map((p) => pName.get(p.planetId)).filter(Boolean),
    }));
  }

  async classReport(user: AuthUser, classId: string, planetId: string) {
    const s = await this.report.scope(user);
    this.report.assertPair(s, classId, planetId);
    return this.report.classReport(s.tenantId, classId, planetId);
  }

  async classReportCsv(user: AuthUser, classId: string, planetId: string) {
    const s = await this.report.scope(user);
    this.report.assertPair(s, classId, planetId);
    return this.report.classReportCsv(s.tenantId, classId, planetId);
  }

  // --------------------------------------------------------------------- tarefas
  /** Tarefas das minhas turmas e matérias. */
  async listTasks(user: AuthUser, classId?: string) {
    const s = await this.report.scope(user);
    if (classId) this.report.assertPair(s, classId);
    const pairs = classId ? s.pairs.filter((p) => p.departmentId === classId) : s.pairs;
    if (!pairs.length) return [];
    const rows = await this.prisma.assignment.findMany({
      where: {
        tenantId: s.tenantId,
        OR: pairs.flatMap((p) => [
          { departmentId: p.departmentId, planetId: p.planetId },
          { departmentId: p.departmentId, course: { planetId: p.planetId } },
        ]),
      },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      include: {
        planet: { select: { id: true, name: true } },
        course: { select: { id: true, title: true, planetId: true } },
        department: { select: { id: true, name: true } },
      },
    });
    return rows.map((a) => ({
      id: a.id,
      kind: a.mandatory ? 'HOMEWORK' : 'STUDY',
      class: a.department,
      planetId: a.planetId ?? a.course?.planetId ?? null,
      title: a.course?.title ?? a.planet?.name ?? '',
      courseId: a.courseId,
      startsAt: a.startsAt,
      dueDate: a.dueDate,
      createdById: a.createdById,
      createdAt: a.createdAt,
    }));
  }

  async createTask(user: AuthUser, dto: TaskDto) {
    const s = await this.report.scope(user);
    this.report.assertPair(s, dto.classId, dto.planetId);
    await this.assertTaskTarget(s.tenantId, dto.planetId, dto.courseId);
    const a = await this.prisma.assignment.create({
      data: {
        tenantId: s.tenantId,
        targetType: dto.courseId ? 'COURSE' : 'PLANET',
        planetId: dto.courseId ? null : dto.planetId,
        courseId: dto.courseId ?? null,
        departmentId: dto.classId,
        mandatory: dto.kind === 'HOMEWORK',
        priority: 100,
        startsAt: toDate(dto.startsAt) ?? null,
        dueDate: toDate(dto.dueDate) ?? null,
        createdById: user.id,
      },
    });
    await this.audit.log(user, 'teacher.task.create', 'assignment', a.id, dto, s.tenantId);
    return a;
  }

  async updateTask(user: AuthUser, id: string, dto: UpdateTaskDto) {
    const s = await this.report.scope(user);
    await this.ownTask(s, id);
    const a = await this.prisma.assignment.update({
      where: { id },
      data: {
        ...(dto.kind ? { mandatory: dto.kind === 'HOMEWORK' } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: toDate(dto.dueDate) } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: toDate(dto.startsAt) } : {}),
      },
    });
    await this.audit.log(user, 'teacher.task.update', 'assignment', id, dto, s.tenantId);
    return a;
  }

  async deleteTask(user: AuthUser, id: string) {
    const s = await this.report.scope(user);
    await this.ownTask(s, id);
    await this.prisma.assignment.delete({ where: { id } });
    await this.audit.log(user, 'teacher.task.delete', 'assignment', id, undefined, s.tenantId);
    return { deleted: true };
  }

  /** A tarefa é de uma turma + matéria que eu ensino? (404 para não revelar tarefas alheias) */
  private async ownTask(s: Awaited<ReturnType<SchoolReportService['scope']>>, id: string) {
    const a = await this.prisma.assignment.findFirst({ where: { id, tenantId: s.tenantId }, include: { course: { select: { planetId: true } } } });
    const planetId = a?.planetId ?? a?.course?.planetId;
    if (!a || !a.departmentId || !planetId || !this.report.teaches(s, a.departmentId, planetId)) throw new NotFoundException('Tarefa não encontrada nas suas turmas');
    return a;
  }

  private async assertTaskTarget(tenantId: string, planetId: string, courseId?: string) {
    if (courseId) {
      const c = await this.prisma.course.findFirst({ where: { id: courseId, planetId, status: 'PUBLISHED' }, select: { id: true } });
      if (!c) throw new BadRequestException('Esse curso não é publicado nessa matéria');
    }
    const enabled = await this.prisma.tenantPlanetAccess.findFirst({ where: { tenantId, planetId, enabled: true } });
    if (!enabled) throw new BadRequestException('A matéria não está liberada para a escola. Fale com o administrador.');
  }

  // -------------------------------------------------------------------- cobrança
  /**
   * Cobra os alunos: aviso no app (+ push quando ligado) e e-mail.
   * Sem lista: todos da turma com tarefa pendente ou atrasada nas minhas matérias.
   */
  async remind(user: AuthUser, dto: TeacherRemindDto) {
    const s = await this.report.scope(user);
    this.report.assertPair(s, dto.classId, dto.planetId);
    const planetIds = dto.planetId ? [dto.planetId] : s.pairs.filter((p) => p.departmentId === dto.classId).map((p) => p.planetId);
    const [cls, tenant, teacher, members, tasks] = await Promise.all([
      this.report.assertClass(s.tenantId, dto.classId),
      this.prisma.tenant.findUniqueOrThrow({ where: { id: s.tenantId }, select: { tradeName: true } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, displayName: true } }),
      this.report.students(s.tenantId, dto.classId),
      this.report.tasks(s.tenantId, dto.classId, planetIds),
    ]);
    if (dto.membershipIds?.length) {
      const ids = new Set(members.map((m) => m.id));
      if (dto.membershipIds.some((id) => !ids.has(id))) throw new BadRequestException('Um ou mais alunos não são desta turma');
    }
    const courseIds = [...new Set(tasks.flatMap((t) => t.courseIds))];
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: { in: members.map((m) => m.userId) }, courseId: { in: courseIds } },
      select: { userId: true, courseId: true, progressPct: true },
    });
    const prog = new Map(enrollments.map((e) => [`${e.userId}|${e.courseId}`, e.progressPct]));
    const teacherName = teacher.name || teacher.displayName || 'Professor(a)';
    let sent = 0;
    for (const m of members) {
      if (dto.membershipIds?.length && !dto.membershipIds.includes(m.id)) continue;
      if (m.status === 'INVITED') continue;
      const pending = tasks.filter((t) => {
        const p = t.courseIds.length ? t.courseIds.reduce((sum, id) => sum + (prog.get(`${m.userId}|${id}`) ?? 0), 0) / t.courseIds.length : 0;
        return p < 100;
      });
      // sem lista escolhida, cobra só quem tem pendência; com lista e sem pendência, vai só o recado
      if (!dto.membershipIds?.length && !pending.length) continue;
      if (!pending.length && !dto.message) continue;
      const list = pending.map((t) => ({ title: t.title, due: br(t.dueDate) }));
      const body = [dto.message?.trim(), list.length ? `Pendente: ${list.map((t) => t.title + (t.due ? ` (prazo ${t.due})` : '')).join('; ')}` : null].filter(Boolean).join('\n');
      await this.notices.send({
        tenantId: s.tenantId,
        userId: m.userId,
        senderId: user.id,
        title: `Recado de ${teacherName} · ${cls.name}`,
        body,
        deviceTokens: m.user.devices.map((d) => d.token),
      });
      await this.email.send({ to: m.user.email, ...templates.teacherReminder(this.email.appUrl, tenant.tradeName, teacherName, dto.message?.trim() || null, list) });
      sent++;
    }
    await this.audit.log(user, 'teacher.reminders', 'department', dto.classId, { sent, planetIds }, s.tenantId);
    return { sent };
  }
}
