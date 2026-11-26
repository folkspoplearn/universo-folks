import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { GuardianService } from './guardian.service';
import { NoticesService } from './notices.service';
import { SchoolAdminService } from './school-admin.service';
import {
  CodeDto, CreateChildDto, CreateClassDto, LinkChildDto, ReportQuery, RolloverDto, SetTeachingDto, TaskDto, TeacherRemindDto, TransferRequestDto, UpdateTaskDto,
} from './school.dto';
import { TeacherService } from './teacher.service';

/** Administrador da escola (e MASTER): `:tenant` = "me" ou o id da escola. ADR 0020. */
@ApiTags('escola · administrador')
@ApiBearerAuth()
@Roles('ADMIN_CLIENTE', 'MASTER_FOLKS')
@Controller('companies/:tenant')
export class SchoolAdminController {
  constructor(private readonly school: SchoolAdminService) {}

  @Get('school/structure') structure(@CurrentUser() u: AuthUser, @Param('tenant') t: string) {
    return this.school.structure(u, t);
  }

  @Post('school/classes') createClass(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Body() dto: CreateClassDto) {
    return this.school.createClass(u, t, dto);
  }

  @Post('school/sync-subjects') @HttpCode(200) sync(@CurrentUser() u: AuthUser, @Param('tenant') t: string) {
    return this.school.syncSubjects(u, t);
  }

  @Get('school/teachers/:membershipId/teaching') teaching(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Param('membershipId', ParseUUIDPipe) m: string) {
    return this.school.teaching(u, t, m);
  }

  @Put('school/teachers/:membershipId/teaching') setTeaching(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Param('membershipId', ParseUUIDPipe) m: string, @Body() dto: SetTeachingDto) {
    return this.school.setTeaching(u, t, m, dto);
  }

  @Get('school/classes/:classId/report') report(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Param('classId', ParseUUIDPipe) c: string, @Query() q: ReportQuery) {
    return this.school.classReport(u, t, c, q.planetId);
  }

  @Get('school/classes/:classId/report.csv') @Header('Content-Type', 'text/csv; charset=utf-8') @Header('Content-Disposition', 'attachment; filename="relatorio-turma.csv"')
  reportCsv(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Param('classId', ParseUUIDPipe) c: string, @Query() q: ReportQuery) {
    return this.school.classReportCsv(u, t, c, q.planetId);
  }

  @Post('school/rollover') @HttpCode(200) rollover(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Body() dto: RolloverDto) {
    return this.school.rollover(u, t, dto);
  }

  @Post('school/transfers') @HttpCode(200) transfer(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Body() dto: TransferRequestDto) {
    return this.school.requestTransfer(u, t, dto.email);
  }

  @Post('school/students/:membershipId/guardian-code') guardianCode(@CurrentUser() u: AuthUser, @Param('tenant') t: string, @Param('membershipId', ParseUUIDPipe) m: string) {
    return this.school.guardianCode(u, t, m);
  }

  /** Secretaria de educação (B2G): visão de todas as escolas da rede. */
  @Get('network') network(@CurrentUser() u: AuthUser, @Param('tenant') t: string) {
    return this.school.network(u, t);
  }
}

/** Professor: minhas turmas, relatório, tarefas e cobrança. O tenant vem do token. */
@ApiTags('escola · professor')
@ApiBearerAuth()
@Roles('PROFESSOR')
@Controller('teacher')
export class TeacherController {
  constructor(private readonly teacher: TeacherService) {}

  @Get('classes') classes(@CurrentUser() u: AuthUser) {
    return this.teacher.classes(u);
  }

  @Get('classes/:classId/report') report(@CurrentUser() u: AuthUser, @Param('classId', ParseUUIDPipe) c: string, @Query() q: ReportQuery) {
    return this.teacher.classReport(u, c, q.planetId);
  }

  @Get('classes/:classId/report.csv') @Header('Content-Type', 'text/csv; charset=utf-8') @Header('Content-Disposition', 'attachment; filename="relatorio-turma.csv"')
  reportCsv(@CurrentUser() u: AuthUser, @Param('classId', ParseUUIDPipe) c: string, @Query() q: ReportQuery) {
    return this.teacher.classReportCsv(u, c, q.planetId);
  }

  @Get('tasks') tasks(@CurrentUser() u: AuthUser, @Query('classId') classId?: string) {
    return this.teacher.listTasks(u, classId || undefined);
  }

  @Post('tasks') createTask(@CurrentUser() u: AuthUser, @Body() dto: TaskDto) {
    return this.teacher.createTask(u, dto);
  }

  @Patch('tasks/:id') updateTask(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaskDto) {
    return this.teacher.updateTask(u, id, dto);
  }

  @Delete('tasks/:id') deleteTask(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.teacher.deleteTask(u, id);
  }

  @Post('reminders') @HttpCode(200) remind(@CurrentUser() u: AuthUser, @Body() dto: TeacherRemindDto) {
    return this.teacher.remind(u, dto);
  }
}

/** Responsável (pai/mãe): filhos, consentimento e acompanhamento. Funciona em qualquer contexto. */
@ApiTags('responsável')
@ApiBearerAuth()
@Controller('guardian')
export class GuardianController {
  constructor(private readonly guardian: GuardianService) {}

  @Get('children') children(@CurrentUser() u: AuthUser) {
    return this.guardian.children(u);
  }

  @Post('children') createChild(@CurrentUser() u: AuthUser, @Body() dto: CreateChildDto) {
    return this.guardian.createChild(u, dto);
  }

  @Post('links') link(@CurrentUser() u: AuthUser, @Body() dto: LinkChildDto) {
    return this.guardian.linkWithCode(u, dto);
  }

  @Get('children/:studentId') child(@CurrentUser() u: AuthUser, @Param('studentId', ParseUUIDPipe) id: string) {
    return this.guardian.child(u, id);
  }

  @Delete('children/:studentId') revoke(@CurrentUser() u: AuthUser, @Param('studentId', ParseUUIDPipe) id: string) {
    return this.guardian.revoke(u, id);
  }
}

/** Lado do aluno: avisos, código para o responsável e transferência de escola. */
@ApiTags('meu perfil')
@ApiBearerAuth()
@Controller('me')
export class MeSchoolController {
  constructor(
    private readonly notices: NoticesService,
    private readonly guardian: GuardianService,
  ) {}

  @Get('notices') list(@CurrentUser() u: AuthUser) {
    return this.notices.list(u.id);
  }

  @Post('notices/read-all') @HttpCode(200) readAll(@CurrentUser() u: AuthUser) {
    return this.notices.markAllRead(u.id);
  }

  @Post('notices/:id/read') @HttpCode(200) read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notices.markRead(u.id, id);
  }

  @Post('guardian-code') guardianCode(@CurrentUser() u: AuthUser) {
    return this.guardian.myCode(u);
  }

  @Get('guardians') guardians(@CurrentUser() u: AuthUser) {
    return this.guardian.myGuardians(u);
  }

  @Post('school-transfer/accept') @HttpCode(200) acceptTransfer(@CurrentUser() u: AuthUser, @Body() dto: CodeDto) {
    return this.guardian.acceptTransfer(u, dto.code);
  }
}
