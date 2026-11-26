/**
 * Escola (ADR 0020): tipos das respostas da API para as telas do administrador da escola,
 * do professor, do responsável e da secretaria.
 */

/** "1".."9" (fundamental) e "m1".."m3" (médio) */
export type Grade = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'm1' | 'm2' | 'm3';
export type TenantSegment = 'CORPORATE' | 'SCHOOL' | 'SCHOOL_NETWORK';
export type TaskKind = 'HOMEWORK' | 'STUDY';
export type TaskState = 'DONE' | 'LATE' | 'PENDING';

export interface SchoolClass {
  id: string;
  name: string;
  students: number;
  teachers: Array<{ membershipId: string; name: string; planet: { id: string; name: string } }>;
}

export interface SchoolGrade {
  grade: Grade;
  label: string;
  departmentId: string | null;
  classes: SchoolClass[];
}

export interface TeachingItem {
  id: string;
  department: { id: string; name: string; grade: Grade | null };
  planet: { id: string; name: string };
}

export interface RolloverStep {
  fromClassId: string;
  fromName: string;
  fromGrade: Grade;
  toGrade: Grade | null;
  toName: string | null;
  move: string[];
  keep: string[];
}

export interface RolloverResult {
  dryRun: boolean;
  steps: RolloverStep[];
  moved: number;
  kept: number;
  graduated: number;
  createdClasses?: string[];
}

export interface TeacherClass {
  id: string;
  name: string;
  grade: Grade | null;
  gradeLabel: string | null;
  students: number;
  subjects: Array<{ id: string; name: string; grade: Grade | null }>;
}

export interface TeacherTask {
  id: string;
  kind: TaskKind;
  class: { id: string; name: string } | null;
  planetId: string | null;
  title: string;
  courseId: string | null;
  startsAt: string | null;
  dueDate: string | null;
  createdById: string | null;
  createdAt: string;
}

export interface ClassReport {
  class: { id: string; name: string; grade: Grade | null; gradeLabel: string | null };
  planet: { id: string; name: string };
  courses: Array<{ id: string; title: string }>;
  tasks: Array<{ assignmentId: string; title: string; kind: TaskKind; dueDate: string | null; courseIds: string[] }>;
  summary: { students: number; avgProgressPct: number; avgPracticeScorePct: number | null; withLateTasks: number; neverStarted: number };
  students: Array<{
    membershipId: string;
    userId: string;
    name: string;
    email: string;
    invited: boolean;
    progressPct: number;
    courses: Record<string, number>;
    practice: { attempts: number; avgScorePct: number | null };
    tasks: Array<{ assignmentId: string; progressPct: number; state: TaskState }>;
    pendingTasks: number;
    lateTasks: number;
    lastActivity: string | null;
  }>;
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  sender: { name: string } | null;
  tenant: { tradeName: string } | null;
}

export interface ChildSummary {
  studentId: string;
  name: string;
  school: { name: string; classes: string[] } | null;
  xp: number;
  streakDays: number;
  coursesStarted: number;
  lastActivity: string | null;
  tasks: Array<{ title: string; progressPct: number; due: string | null; homework: boolean }>;
}

export interface ChildDetail extends ChildSummary {
  courses: Array<{ id: string; title: string; subject: string; grade: Grade | null; progressPct: number; status: string; lastStudied: string; completedAt: string | null }>;
}

export interface NetworkOverview {
  network: { id: string; name: string };
  totals: { schools: number; students: number; teachers: number; activeLast7Days: number };
  schools: Array<{ id: string; name: string; status: string; students: number; teachers: number; activeLast7Days: number; avgTaskProgressPct: number; studentsLate: number }>;
}
