'use client';

import { useSession } from '@/lib/session';
import { PageTitle } from '@/components/ui';
import { SchoolClasses } from '@/components/school/admin';

export default function Page() {
  const { context } = useSession();
  return (
    <>
      <PageTitle title="Turmas" subtitle="As séries e turmas da escola. Toque numa turma para ver o relatório." />
      <SchoolClasses tenantId={context!.tenantId!} />
    </>
  );
}
