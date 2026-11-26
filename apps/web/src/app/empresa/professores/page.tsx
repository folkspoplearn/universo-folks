'use client';

import { useSession } from '@/lib/session';
import { PageTitle } from '@/components/ui';
import { SchoolTeachers } from '@/components/school/admin';

export default function Page() {
  const { context } = useSession();
  return (
    <>
      <PageTitle title="Professores" subtitle="Em quais turmas e matérias cada professor dá aula." />
      <SchoolTeachers tenantId={context!.tenantId!} />
    </>
  );
}
