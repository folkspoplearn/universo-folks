'use client';

import { useSession } from '@/lib/session';
import { PageTitle } from '@/components/ui';
import { SchoolTransfers } from '@/components/school/admin';

export default function Page() {
  const { context } = useSession();
  return (
    <>
      <PageTitle title="Transferências e responsáveis" subtitle="Receba alunos de outras escolas e libere o acompanhamento dos pais." />
      <SchoolTransfers tenantId={context!.tenantId!} />
    </>
  );
}
