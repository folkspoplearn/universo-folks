'use client';

import { useParams } from 'next/navigation';
import { useSession } from '@/lib/session';
import { PageTitle } from '@/components/ui';
import { SchoolClassReport } from '@/components/school/admin';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const { context } = useSession();
  return (
    <>
      <PageTitle title="Relatório da turma" subtitle="Progresso, práticas e tarefas de cada aluno, por matéria." back={{ href: '/empresa/turmas', label: 'Turmas' }} />
      <SchoolClassReport tenantId={context!.tenantId!} classId={id} />
    </>
  );
}
