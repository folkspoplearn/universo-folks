'use client';

import { PageTitle } from '@/components/ui';
import { TeacherTasks } from '@/components/school/teacher';

export default function Page() {
  return (
    <>
      <PageTitle title="Tarefas" subtitle="Lições de casa e estudos que você passou para as suas turmas." />
      <TeacherTasks />
    </>
  );
}
