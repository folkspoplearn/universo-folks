'use client';

import { useSession } from '@/lib/session';
import { PageTitle } from '@/components/ui';
import { NetworkOverviewView } from '@/components/school/admin';

export default function Page() {
  const { context } = useSession();
  return (
    <>
      <PageTitle title="Visão da rede" subtitle="Todas as escolas da secretaria de educação." />
      <NetworkOverviewView tenantId={context!.tenantId!} />
    </>
  );
}
