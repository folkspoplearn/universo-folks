'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/session';
import { PageTitle } from '@/components/ui';
import { TeacherClassPage } from '@/components/school/teacher';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const planetId = useSearchParams().get('materia') ?? '';
  const { api } = useSession();
  const classes = useQuery({ queryKey: ['teacher', 'classes'], queryFn: () => api.teacher.classes() });
  const cls = classes.data?.find((c) => c.id === id);
  const subject = cls?.subjects.find((s) => s.id === planetId);
  return (
    <>
      <PageTitle title={cls ? `${cls.name}${subject ? ` · ${subject.name}` : ''}` : 'Turma'} subtitle="Relatório, tarefas e cobrança." back={{ href: '/professor', label: 'Minhas turmas' }} />
      <TeacherClassPage classId={id} planetId={planetId || cls?.subjects[0]?.id || ''} />
    </>
  );
}
