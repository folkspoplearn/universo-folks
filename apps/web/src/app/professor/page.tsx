'use client';

import { PageTitle } from '@/components/ui';
import { TeacherHome } from '@/components/school/teacher';

export default function Page() {
  return (
    <>
      <PageTitle title="Minhas turmas" subtitle="As turmas e matérias em que você dá aula." />
      <TeacherHome />
    </>
  );
}
