import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested,
} from 'class-validator';
import { PASSWORD_MSG, PASSWORD_RULE } from '../auth/dto/auth.dto';
import { GRADES } from './school-rules';

// ------------------------------------------------------------ administrador da escola
export class CreateClassDto {
  /** série: "1".."9" (fundamental) ou "m1".."m3" (médio) */
  @IsIn(GRADES as unknown as string[], { message: 'Série inválida: use 1 a 9 ou m1 a m3' }) grade: string;
  /** como a escola chama a turma: A, B, Manhã... */
  @IsString() @MinLength(1) @MaxLength(30) suffix: string;
}

export class TeachingItemDto {
  /** turma */
  @IsUUID() departmentId: string;
  /** matéria (planeta) */
  @IsUUID() planetId: string;
}

export class SetTeachingDto {
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => TeachingItemDto) items: TeachingItemDto[];
}

export class RolloverDto {
  /** vínculos (membershipId) de quem repete o ano */
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) keepBack?: string[];
  /** true = só mostra o que vai acontecer */
  @IsOptional() @IsBoolean() dryRun?: boolean;
}

export class TransferRequestDto {
  @IsEmail() email: string;
}

// --------------------------------------------------------------------- professor
export class TaskDto {
  @IsUUID() classId: string;
  /** matéria (planeta) que o professor ensina nesta turma */
  @IsUUID() planetId: string;
  /** opcional: só um curso da matéria */
  @IsOptional() @IsUUID() courseId?: string;
  /** HOMEWORK = lição de casa (obrigatória); STUDY = só estudo */
  @IsIn(['HOMEWORK', 'STUDY']) kind: 'HOMEWORK' | 'STUDY';
  /** vazio = em aberto */
  @IsOptional() @IsDateString() dueDate?: string | null;
  @IsOptional() @IsDateString() startsAt?: string | null;
}

export class UpdateTaskDto {
  @IsOptional() @IsIn(['HOMEWORK', 'STUDY']) kind?: 'HOMEWORK' | 'STUDY';
  /** null = em aberto */
  @IsOptional() @IsDateString() dueDate?: string | null;
  @IsOptional() @IsDateString() startsAt?: string | null;
}

export class TeacherRemindDto {
  @IsUUID() classId: string;
  /** só as tarefas desta matéria (padrão: todas as do professor na turma) */
  @IsOptional() @IsUUID() planetId?: string;
  /** padrão: alunos com tarefa pendente ou atrasada */
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) membershipIds?: string[];
  /** recado do professor (opcional) */
  @IsOptional() @IsString() @MaxLength(500) message?: string;
}

export class ReportQuery {
  @IsUUID() planetId: string;
}

// ------------------------------------------------------------------- responsável
export class CreateChildDto {
  @IsString() @MinLength(2) name: string;
  @IsEmail() email: string;
  @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password: string;
  @IsDateString({ strict: true }) birthDate: string;
  /** o responsável aceita o termo de consentimento (obrigatório) */
  @IsBoolean() consent: boolean;
}

export class LinkChildDto {
  @IsString() @MinLength(6) code: string;
  @IsBoolean() consent: boolean;
}

export class CodeDto {
  @IsString() @MinLength(6) code: string;
}
