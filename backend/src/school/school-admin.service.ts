import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/types';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { SeatsService } from '../access/seats.service';
import { EmailService, templates } from '../email/email.service';
import { humanCode, sha256 } from '../common/utils';
import { CompanyInsightsService } from '../companies/insights.service';
import { SchoolReportService } from './school-report.service';
import { CreateClassDto, RolloverDto, SetTeachingDto } from './school.dto';
import { Grade, GRADES, className, gradeLabel, isGrade, planRollover } from './school-rules';

type Tx = Prisma.TransactionClient;
const SCHOOL_CATEGORY = 'para-a-escola';

/**
 * Gestão da escola pelo administrador (e pelo MASTER): séries, turmas, professores,
 * virada de ano, transferências e código do responsável. ADR 0020.
 * O isolamento é o mesmo da empresa: AccessService.resolveTenant em TODOS os métodos.
 */
@Injectable()
export class SchoolAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly seats: SeatsService,
    private readonly email: EmailService,
    private readonly insights: CompanyInsightsService,
    private readonly report: SchoolReportService,
  ) {}

  /** Tenant da operação; precisa ser uma escola. */
  async schoolId(user: AuthUser, param: string) {
    const tenantId = this.access.resolveTenant(user, param === 'me' ? undefined : param);
    const t = await this.prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null }, select: { segment: true } });
    if (!t) throw new NotFoundException('Escola não encontrada');
    if (t.segment !== 'SCHOOL') throw new BadRequestException({ error: 'not_a_school', message: 'Esta conta não é uma escola. Peça à Folks para marcar o cadastro como escola.' });
    return tenantId;
  }

  // ------------------------------------------------------------ séries e turmas
  /** Séries com as turmas, quantos alunos e os professores de cada turma. */
  async structure(user: AuthUser, param: string) {
    const tenantId = await this.schoolId(user, param);
    const deps = await this.prisma.department.findMany({
      where: { tenantId, kind: { in: ['GRADE', 'CLASS'] } },
      include: {
        _count: { select: { members: { where: { membership: { role: 'COLABORADOR_CLIENTE', status: { in: ['ACTIVE', 'INVITED'] } } } } } },
        teaching: { select: { planet: { select: { id: true, name: true } }, membership: { select: { id: true, user: { select: { name: true } } } } } },
      },
    });
    const classes = deps.filter((d) => d.kind === 'CLASS');
    return GRADES.filter((g) => deps.some((d) => d.grade === g)).map((g) => {
      const grade = deps.find((d) => d.kind === 'GRADE' && d.grade === g);
      return {
        grade: g,
        label: gradeLabel(g),
        departmentId: grade?.id ?? null,
        classes: classes
          .filter((c) => c.grade === g)
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
          .map((c) => ({
            id: c.id,
            name: c.name,
            students: c._count.members,
            teachers: c.teaching.map((t) => ({ membershipId: t.membership.id, name: t.membership.user.name, planet: t.planet })),
          })),
      };
    });
  }

  /** Cria a turma (e a série, se faltar) e libera para ela as matérias da série. */
  async createClass(user: AuthUser, param: string, dto: CreateClassDto) {
    const tenantId = await this.schoolId(user, param);
    if (!isGrade(dto.grade)) throw new BadRequestException('Série inválida');
    const c = await this.prisma.$transaction(async (tx) => {
      const name = className(dto.grade as Grade, dto.suffix);
      if (await tx.department.findFirst({ where: { tenantId, name } })) throw new ConflictException(`A turma ${name} já existe`);
      const grade = await this.ensureGrade(tx, tenantId, dto.grade as Grade);
      const cls = await tx.department.create({ data: { tenantId, name, kind: 'CLASS', grade: dto.grade, parentId: grade.id } });
      const released = await this.releaseGradeSubjects(tx, tenantId, cls.id, dto.grade as Grade);
      return { ...cls, subjectsReleased: released };
    });
    await this.audit.log(user, 'school.class.create', 'department', c.id, dto, tenantId);
    return c;
  }

  /** Reaplica a liberação das matérias de cada série às turmas (depois de importar conteúdo novo). */
  async syncSubjects(user: AuthUser, param: string) {
    const tenantId = await this.schoolId(user, param);
    const classes = await this.prisma.department.findMany({ where: { tenantId, kind: 'CLASS', grade: { not: null } }, select: { id: true, grade: true } });
    let released = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const c of classes) if (isGrade(c.grade)) released += await this.releaseGradeSubjects(tx, tenantId, c.id, c.grade);
    });
    await this.audit.log(user, 'school.subjects.sync', 'tenant', tenantId, { classes: classes.length, released }, tenantId);
    return { classes: classes.length, released };
  }

  private async ensureGrade(tx: Tx, tenantId: string, g: Grade) {
    const found = await tx.department.findFirst({ where: { tenantId, kind: 'GRADE', grade: g } });
    if (found) return found;
    const name = gradeLabel(g);
    if (await tx.department.findFirst({ where: { tenantId, name } })) {
      throw new ConflictException(`Já existe um departamento chamado "${name}" que não é série. Renomeie-o antes.`);
    }
    return tx.department.create({ data: { tenantId, name, kind: 'GRADE', grade: g } });
  }

  /**
   * Libera para a turma os planetas "Para a escola" da mesma série. Não mexe em planeta que a escola
   * já liberou para todos. Devolve quantas ligações novas foram feitas.
   */
  private async releaseGradeSubjects(tx: Tx, tenantId: string, classId: string, g: Grade) {
    const planets = await tx.planet.findMany({
      where: { grade: g, status: { in: ['PUBLISHED', 'COMING_SOON'] }, availableB2B: true, category: { slug: SCHOOL_CATEGORY } },
      select: { id: true },
    });
    let n = 0;
    for (const p of planets) {
      const access = await tx.tenantPlanetAccess.upsert({
        where: { tenantId_planetId: { tenantId, planetId: p.id } },
        create: { tenantId, planetId: p.id, enabled: true, allDepartments: false },
        update: {},
      });
      if (access.allDepartments) continue;
      const exists = await tx.tenantPlanetDepartment.findUnique({ where: { accessId_departmentId: { accessId: access.id, departmentId: classId } } });
      if (!exists) {
        await tx.tenantPlanetDepartment.create({ data: { accessId: access.id, departmentId: classId } });
        n++;
      }
    }
    return n;
  }

  // ---------------------------------------------------------------- professores
  async teaching(user: AuthUser, param: string, membershipId: string) {
    const tenantId = await this.schoolId(user, param);
    await this.assertTeacher(tenantId, membershipId);
    return this.prisma.teachingAssignment.findMany({
      where: { tenantId, membershipId },
      select: { id: true, department: { select: { id: true, name: true, grade: true } }, planet: { select: { id: true, name: true } } },
      orderBy: { department: { name: 'asc' } },
    });
  }

  /** Define as turmas e matérias do professor (substitui a lista inteira). */
  async setTeaching(user: AuthUser, param: string, membershipId: string, dto: SetTeachingDto) {
    const tenantId = await this.schoolId(user, param);
    await this.assertTeacher(tenantId, membershipId);
    const classIds = [...new Set(dto.items.map((i) => i.departmentId))];
    const planetIds = [...new Set(dto.items.map((i) => i.planetId))];
    const [classes, enabled] = await Promise.all([
      this.prisma.department.count({ where: { tenantId, kind: 'CLASS', id: { in: classIds } } }),
      this.prisma.tenantPlanetAccess.count({ where: { tenantId, enabled: true, planetId: { in: planetIds } } }),
    ]);
    if (classes !== classIds.length) throw new BadRequestException('Uma ou mais turmas não pertencem a esta escola');
    if (enabled !== planetIds.length) throw new BadRequestException('Uma ou mais matérias não estão liberadas para a escola');
    const unique = [...new Map(dto.items.map((i) => [`${i.departmentId}|${i.planetId}`, i])).values()];
    await this.prisma.$transaction([
      this.prisma.teachingAssignment.deleteMany({ where: { tenantId, membershipId } }),
      this.prisma.teachingAssignment.createMany({ data: unique.map((i) => ({ tenantId, membershipId, departmentId: i.departmentId, planetId: i.planetId })) }),
    ]);
    await this.audit.log(user, 'school.teaching.set', 'membership', membershipId, { items: unique.length }, tenantId);
    return this.teaching(user, param, membershipId);
  }

  private async assertTeacher(tenantId: string, membershipId: string) {
    const m = await this.prisma.membership.findFirst({ where: { id: membershipId, tenantId, role: 'PROFESSOR' } });
    if (!m) throw new NotFoundException('Professor não encontrado nesta escola');
    return m;
  }

  /** Relatório de uma turma numa matéria, visto pelo administrador. */
  async classReport(user: AuthUser, param: string, classId: string, planetId: string) {
    const tenantId = await this.schoolId(user, param);
    return this.report.classReport(tenantId, classId, planetId);
  }

  async classReportCsv(user: AuthUser, param: string, classId: string, planetId: string) {
    const tenantId = await this.schoolId(user, param);
    return this.report.classReportCsv(tenantId, classId, planetId);
  }

  // ---------------------------------------------------------------- virada de ano
  /**
   * Passa todas as turmas para a série seguinte (mesma letra), com exceção de quem repete.
   * 3ª série do médio: os alunos saem da turma (formados) e continuam ocupando licença até o
   * administrador removê-los. O professor continua na turma de origem.
   */
  async rollover(user: AuthUser, param: string, dto: RolloverDto) {
    const tenantId = await this.schoolId(user, param);
    const classes = await this.prisma.department.findMany({
      where: { tenantId, kind: 'CLASS', grade: { not: null } },
      select: { id: true, name: true, grade: true, members: { where: { membership: { role: 'COLABORADOR_CLIENTE', status: { in: ['ACTIVE', 'INVITED'] } } }, select: { membershipId: true } } },
    });
    if (dto.keepBack?.length) {
      const n = await this.prisma.membership.count({ where: { tenantId, id: { in: dto.keepBack } } });
      if (n !== new Set(dto.keepBack).size) throw new BadRequestException('Um ou mais alunos da lista de repetência não são desta escola');
    }
    const plan = planRollover(
      classes.filter((c) => isGrade(c.grade)).map((c) => ({ id: c.id, name: c.name, grade: c.grade as Grade, studentIds: c.members.map((m) => m.membershipId) })),
      dto.keepBack ?? [],
    );
    if (dto.dryRun) return { dryRun: true, ...plan };

    const created: string[] = [];
    await this.prisma.$transaction(
      async (tx) => {
        for (const step of plan.steps) {
          if (!step.move.length) continue;
          await tx.membershipDepartment.deleteMany({ where: { departmentId: step.fromClassId, membershipId: { in: step.move } } });
          if (!step.toGrade || !step.toName) continue; // formatura
          let target = await tx.department.findFirst({ where: { tenantId, name: step.toName } });
          if (target && (target.kind !== 'CLASS' || target.grade !== step.toGrade)) {
            throw new ConflictException(`Já existe "${step.toName}" e não é uma turma da série seguinte. Renomeie antes de virar o ano.`);
          }
          if (!target) {
            const grade = await this.ensureGrade(tx, tenantId, step.toGrade);
            target = await tx.department.create({ data: { tenantId, name: step.toName, kind: 'CLASS', grade: step.toGrade, parentId: grade.id } });
            await this.releaseGradeSubjects(tx, tenantId, target.id, step.toGrade);
            created.push(target.name);
          }
          await tx.membershipDepartment.createMany({ data: step.move.map((membershipId) => ({ membershipId, departmentId: target!.id })), skipDuplicates: true });
        }
      },
      { timeout: 60_000 },
    );
    await this.audit.log(user, 'school.rollover', 'tenant', tenantId, { moved: plan.moved, kept: plan.kept, graduated: plan.graduated, created }, tenantId);
    return { dryRun: false, ...plan, createdClasses: created };
  }

  // -------------------------------------------------------------- transferência
  /**
   * A escola pede a transferência de um aluno que está em outra escola (ou empresa).
   * O aluno aceita com o código (e-mail). O código também volta aqui, para a escola
   * poder passar ao aluno se o e-mail não chegar: sem o login do aluno ele não serve.
   */
  async requestTransfer(user: AuthUser, param: string, email: string) {
    const tenantId = await this.schoolId(user, param);
    const target = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!target || target.deletedAt) throw new NotFoundException('Não há conta com esse e-mail. Cadastre o aluno normalmente em Pessoas.');
    const here = await this.prisma.membership.findUnique({ where: { userId_tenantId: { userId: target.id, tenantId } } });
    if (here && here.status !== 'DISABLED') throw new ConflictException('Essa pessoa já está nesta escola');
    const other = await this.prisma.membership.findFirst({ where: { userId: target.id, tenantId: { not: tenantId }, status: { in: ['ACTIVE', 'INVITED'] } } });
    if (!other) throw new BadRequestException({ error: 'no_transfer_needed', message: 'Essa pessoa não está em outra escola. Cadastre normalmente em Pessoas.' });
    if (other.role === 'ADMIN_CLIENTE') throw new ConflictException('Essa pessoa administra outra conta e não pode ser transferida como aluno');
    await this.seats.assertAvailable(tenantId, 'COLABORADOR_CLIENTE');
    const school = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { tradeName: true } });
    const code = humanCode('TRANSF', 2);
    await this.prisma.oneTimeToken.updateMany({ where: { userId: target.id, purpose: 'SCHOOL_TRANSFER', tenantId, usedAt: null }, data: { usedAt: new Date() } });
    await this.prisma.oneTimeToken.create({ data: { tokenHash: sha256(code), userId: target.id, purpose: 'SCHOOL_TRANSFER', tenantId, expiresAt: new Date(Date.now() + 14 * 86400_000) } });
    await this.email.send({ to: target.email, ...templates.schoolTransfer(this.email.appUrl, school.tradeName, code) });
    await this.audit.log(user, 'school.transfer.request', 'user', target.id, undefined, tenantId);
    return { sent: true, code, expiresInDays: 14 };
  }

  // --------------------------------------------------------- código do responsável
  /** Código para o responsável de um aluno desta escola se ligar a ele (30 dias). */
  async guardianCode(user: AuthUser, param: string, membershipId: string) {
    const tenantId = await this.schoolId(user, param);
    const m = await this.prisma.membership.findFirst({ where: { id: membershipId, tenantId, role: 'COLABORADOR_CLIENTE', status: { in: ['ACTIVE', 'INVITED'] } } });
    if (!m) throw new NotFoundException('Aluno não encontrado nesta escola');
    const code = humanCode('RESP', 2);
    await this.prisma.oneTimeToken.create({ data: { tokenHash: sha256(code), userId: m.userId, purpose: 'GUARDIAN_LINK', tenantId, expiresAt: new Date(Date.now() + 30 * 86400_000) } });
    await this.audit.log(user, 'school.guardian_code', 'membership', membershipId, undefined, tenantId);
    return { code, expiresInDays: 30 };
  }

  // ---------------------------------------------------------- secretaria (B2G)
  /** Visão da rede: cada escola com alunos, professores, ativos na semana e progresso médio nas tarefas. */
  async network(user: AuthUser, param: string) {
    const tenantId = this.access.resolveTenant(user, param === 'me' ? undefined : param);
    const net = await this.prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null }, select: { id: true, tradeName: true, segment: true } });
    if (!net) throw new NotFoundException('Conta não encontrada');
    if (net.segment !== 'SCHOOL_NETWORK') throw new ForbiddenException('A visão da rede é da secretaria de educação');
    const schools = await this.prisma.tenant.findMany({ where: { networkId: tenantId, deletedAt: null }, select: { id: true, tradeName: true, status: true }, orderBy: { tradeName: 'asc' } });
    const since = new Date(Date.now() - 7 * 86400_000);
    const rows = await Promise.all(
      schools.map(async (s) => {
        const [roles, active, people] = await Promise.all([
          this.prisma.membership.groupBy({ by: ['role'], where: { tenantId: s.id, status: 'ACTIVE' }, _count: true }),
          this.prisma.activityEvent.findMany({ where: { day: { gte: since }, user: { memberships: { some: { tenantId: s.id, status: 'ACTIVE' } } } }, select: { userId: true }, distinct: ['userId'] }),
          this.insights.people(s.id),
        ]);
        const count = (r: string) => roles.find((x) => x.role === r)?._count ?? 0;
        const students = people.filter((p) => p.role === 'COLABORADOR_CLIENTE' && p.status !== 'INVITED');
        return {
          id: s.id,
          name: s.tradeName,
          status: s.status,
          students: count('COLABORADOR_CLIENTE'),
          teachers: count('PROFESSOR'),
          activeLast7Days: active.length,
          avgTaskProgressPct: students.length ? Math.round((students.reduce((sum, p) => sum + p.progress, 0) / students.length) * 100) : 0,
          studentsLate: students.filter((p) => p.status === 'LATE').length,
        };
      }),
    );
    return {
      network: { id: net.id, name: net.tradeName },
      totals: {
        schools: rows.length,
        students: rows.reduce((s, r) => s + r.students, 0),
        teachers: rows.reduce((s, r) => s + r.teachers, 0),
        activeLast7Days: rows.reduce((s, r) => s + r.activeLast7Days, 0),
      },
      schools: rows,
    };
  }
}
