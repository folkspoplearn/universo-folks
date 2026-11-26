'use client';

import { useSession } from '@/lib/session';
import { PageTitle } from '@/components/ui';
import { SchoolRollover } from '@/components/school/admin';

export default function Page() {
  const { context } = useSession();
  return (
    <>
      <PageTitle title="Virada de ano" subtitle="Passe todos para a série seguinte com um botão." />
      <SchoolRollover tenantId={context!.tenantId!} />
    </>
  );
}
