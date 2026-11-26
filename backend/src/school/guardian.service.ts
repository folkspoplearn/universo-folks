import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { SeatsService } from '../access/seats.service';
import { humanCode, sha256 } from '../common/utils';
import { oneCompanyKey } from '../access/membership-rules';
import { CompanyInsightsService } from '../companies/insights.service';
import { CreateChildDto, LinkChildDto } from './school.dto';
import { GUARDIAN_CONSENT_VERSION, ageOn } from './school-rules';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const norm = (code: string) => code.trim().toUpperCase();

/**
 * Responsável (pai/mãe) e o aluno (ADR 0020):
 *  - o responsável cria a conta do filho ou se liga a ele por um código;
 *  - registra o consentimento (data e versão do termo);
 *  - acompanha cursos, progresso, tarefas e última atividade de cada filho.
 * Também a aceitação da transferência de escola, que é do aluno.
 */
@Injectable()
export class GuardianService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly seats: SeatsService,
    private readonly insights: CompanyInsightsService,
    private readonly auth: AuthService,
  ) {}

  /** O responsável precisa ser maior de idade, com a data de nascimento informada. */
  private async assertAdult(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { birthDate: true } });
    if (!u.birthDate) throw new BadRequestException({ error: 'birth_date_required', message: 'Informe sua data de nascimento no perfil antes de acompanhar um filho.' });
    if (ageOn(u.birthDate) < 18) throw new ForbiddenException('Só um adulto pode ser responsável');
  }

  /** O responsável cria a conta do filho (criança avulsa) e já fica ligado a ela. */
  async createChild(user: AuthUser, dto: CreateChildDto) {
    if (!dto.consent) throw new BadRequestException({ error: 'consent_required', message: 'É preciso aceitar o termo de consentimento.' });
    await this.assertAdult(user.id);
    const birth = new Date(`${dto.birthDate}T00:00:00.000Z`);
    if (ageOn(birth) >= 18) throw new BadRequestException('A conta de filho é para menores de 18 anos');
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException(`${email} já tem uma conta. Peça o código de responsável dentro do app do seu filho.`);
    const passwordHash = await AuthService.hashPassword(dto.password);
    const child = await this.prisma.$transaction(async (tx) => {
      const c = await tx.user.create({
        data: {
          name: dto.name,
          displayName: dto.name.split(' ')[0],
          email,
          passwordHash,
          birthDate: birth,
          createdById: user.id,
          preferences: { create: {} },
          gamification: { create: {} },
        },
      });
      await tx.guardianLink.create({ data: { guardianId: user.id, studentId: c.id, consentVersion: GUARDIAN_CONSENT_VERSION, consentAt: new Date() } });
      return c;
    });
    await this.audit.log(user, 'guardian.child.create', 'user', child.id, { consentVersion: GUARDIAN_CONSENT_VERSION });
    return { studentId: child.id, email, consentVersion: GUARDIAN_CONSENT_VERSION };
  }

  /** O responsável se liga a um aluno com o código gerado pelo aluno ou pela escola. */
  async linkWithCode(user: AuthUser, dto: LinkChildDto) {
    if (!dto.consent) throw new BadRequestException({ error: 'consent_required', message: 'É preciso aceitar o termo de consentimento.' });
    await this.assertAdult(user.id);
    const row = await this.prisma.oneTimeToken.findUnique({ where: { tokenHash: sha256(norm(dto.code)) } });
    if (!row || row.purpose !== 'GUARDIAN_LINK' || row.usedAt || row.expiresAt < new Date()) throw new BadRequestException('Código inválido ou expirado. Peça um novo.');
    if (row.userId === user.id) throw new BadRequestException('Você não pode ser responsável por você mesmo');
    const now = new Date();
    const link = await this.prisma.$transaction(async (tx) => {
      await tx.oneTimeToken.update({ where: { tokenHash: row.tokenHash }, data: { usedAt: now } });
      return tx.guardianLink.upsert({
        where: { guardianId_studentId: { guardianId: user.id, studentId: row.userId } },
        create: { guardianId: user.id, studentId: row.userId, consentVersion: GUARDIAN_CONSENT_VERSION, consentAt: now },
        update: { status: 'ACTIVE', revokedAt: null, consentVersion: GUARDIAN_CONSENT_VERSION, consentAt: now },
      });
    });
    await this.audit.log(user, 'guardian.link', 'user', row.userId, { consentVersion: GUARDIAN_CONSENT_VERSION }, row.tenantId ?? undefined);
    return { studentId: link.studentId, consentVersion: link.consentVersion };
  }

  /** Código para um responsável se ligar à minha conta (o próprio aluno gera; 30 dias). */
  async myCode(user: AuthUser) {
    const code = humanCode('RESP', 2);
    await this.prisma.oneTimeToken.create({ data: { tokenHash: sha256(code), userId: user.id, purpose: 'GUARDIAN_LINK', expiresAt: new Date(Date.now() + 30 * 86400_000) } });
    return { code, expiresInDays: 30 };
  }

  /** Meus responsáveis (visto pelo aluno). */
  async myGuardians(user: AuthUser) {
    const links = await this.prisma.guardianLink.findMany({ where: { studentId: user.id, status: 'ACTIVE' }, select: { consentAt: true, guardian: { select: { name: true, email: true } } } });
    return links.map((l) => ({ name: l.guardian.name, email: l.guardian.email, since: l.consentAt }));
  }

  private async assertChild(guardianId: string, studentId: string) {
    const link = await this.prisma.guardianLink.findFirst({ where: { guardianId, studentId, status: 'ACTIVE' } });
    if (!link) throw new NotFoundException('Filho não encontrado na sua conta');
    return link;
  }

  /** Meus filhos, com um resumo de cada um. */
  async children(user: AuthUser) {
    const links = await this.prisma.guardianLink.findMany({
      where: { guardianId: user.id, status: 'ACTIVE' },
      select: { studentId: true, student: { select: { name: true, displayName: true, deletedAt: true } } },
    });
    return Promise.all(links.filter((l) => !l.student.deletedAt).map((l) => this.summary(l.studentId, l.student.displayName ?? l.student.name)));
  }

  async child(user: AuthUser, studentId: string) {
    await this.assertChild(user.id, studentId);
    const s = await this.prisma.user.findUniqueOrThrow({ where: { id: studentId }, select: { name: true, displayName: true } });
    const [summary, enrollments] = await Promise.all([
      this.summary(studentId, s.displayName ?? s.name),
      this.prisma.enrollment.findMany({
        where: { userId: studentId },
        orderBy: { updatedAt: 'desc' },
        select: { progressPct: true, status: true, updatedAt: true, completedAt: true, course: { select: { id: true, title: true, planet: { select: { name: true, grade: true } } } } },
      }),
    ]);
    return {
      ...summary,
      courses: enrollments.map((e) => ({
        id: e.course.id,
        title: e.course.title,
        subject: e.course.planet.name,
        grade: e.course.planet.grade,
        progressPct: e.progressPct,
        status: e.status,
        lastStudied: iso(e.updatedAt),
        completedAt: e.completedAt ? iso(e.completedAt) : null,
      })),
    };
  }

  private async summary(studentId: string, name: string) {
    const [membership, gam, last, courses] = await Promise.all([
      this.prisma.membership.findFirst({
        where: { userId: studentId, status: 'ACTIVE' },
        select: { id: true, tenantId: true, tenant: { select: { tradeName: true, segment: true } }, departments: { select: { department: { select: { name: true, kind: true } } } } },
      }),
      this.prisma.userGamification.findUnique({ where: { userId: studentId } }),
      this.prisma.activityEvent.findFirst({ where: { userId: studentId }, orderBy: { day: 'desc' }, select: { day: true } }),
      this.prisma.enrollment.count({ where: { userId: studentId } }),
    ]);
    let tasks: { title: string; progressPct: number; due: string | null; homework: boolean }[] = [];
    if (membership?.tenant.segment === 'SCHOOL') {
      const p = (await this.insights.people(membership.tenantId)).find((x) => x.membershipId === membership.id);
      tasks = p?.tracks.map((t) => ({ title: t.title, progressPct: Math.round(t.progress * 100), due: t.due, homework: t.mandatory })) ?? [];
    }
    return {
      studentId,
      name,
      school: membership?.tenant.segment === 'SCHOOL'
        ? { name: membership.tenant.tradeName, classes: membership.departments.filter((d) => d.department.kind === 'CLASS').map((d) => d.department.name) }
        : null,
      xp: gam?.totalXp ?? 0,
      streakDays: gam?.currentStreak ?? 0,
      coursesStarted: courses,
      lastActivity: last ? iso(last.day) : null,
      tasks,
    };
  }

  async revoke(user: AuthUser, studentId: string) {
    const link = await this.assertChild(user.id, studentId);
    await this.prisma.guardianLink.update({ where: { id: link.id }, data: { status: 'REVOKED', revokedAt: new Date() } });
    await this.audit.log(user, 'guardian.revoke', 'user', studentId);
    return { revoked: true };
  }

  // ---------------------------------------------------------- transferência
  /**
   * O aluno aceita a transferência pedida pela nova escola. A matrícula antiga é desativada
   * (o histórico é da pessoa) e a nova é criada ou reativada. Devolve a sessão já na escola nova,
   * porque o token antigo apontava para a matrícula desativada.
   */
  async acceptTransfer(user: AuthUser, code: string) {
    const row = await this.prisma.oneTimeToken.findUnique({ where: { tokenHash: sha256(norm(code)) } });
    if (!row || row.purpose !== 'SCHOOL_TRANSFER' || row.userId !== user.id || row.usedAt || row.expiresAt < new Date() || !row.tenantId) {
      throw new BadRequestException('Código inválido ou expirado. Peça um novo à escola.');
    }
    const tenantId = row.tenantId;
    const school = await this.prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null, status: 'ACTIVE' }, select: { tradeName: true } });
    if (!school) throw new BadRequestException('A escola não está ativa');
    const now = new Date();
    const m = await this.prisma.$transaction(async (tx) => {
      const others = await tx.membership.findMany({ where: { userId: user.id, tenantId: { not: tenantId }, status: { in: ['ACTIVE', 'INVITED'] } } });
      if (others.some((o) => o.role === 'ADMIN_CLIENTE')) throw new ConflictException('Você administra outra conta. Passe a administração antes de mudar de escola.');
      for (const o of others) {
        await tx.membership.update({ where: { id: o.id }, data: { status: 'DISABLED', oneCompanyKey: oneCompanyKey(user.id, 'DISABLED') } });
      }
      await this.seats.assertAvailable(tenantId, 'COLABORADOR_CLIENTE', tx);
      await tx.oneTimeToken.update({ where: { tokenHash: row.tokenHash }, data: { usedAt: now } });
      const existing = await tx.membership.findUnique({ where: { userId_tenantId: { userId: user.id, tenantId } } });
      return existing
        ? tx.membership.update({ where: { id: existing.id }, data: { status: 'ACTIVE', role: 'COLABORADOR_CLIENTE', oneCompanyKey: user.id, joinedAt: now } })
        : tx.membership.create({ data: { userId: user.id, tenantId, oneCompanyKey: user.id, role: 'COLABORADOR_CLIENTE', status: 'ACTIVE', invitedAt: now, joinedAt: now } });
    });
    await this.audit.log(user, 'school.transfer.accept', 'membership', m.id, undefined, tenantId);
    const session = await this.auth.switchContext(user, { mode: 'TENANT', tenantId });
    return { tenantId, school: school.tradeName, membershipId: m.id, session };
  }
}
