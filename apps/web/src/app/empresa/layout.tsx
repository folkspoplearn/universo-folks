import { EmpresaShell } from '@/components/company/empresa-shell';

/** Painel do administrador (empresa, escola ou secretaria): o menu vem do segmento da conta (ADR 0020). */
export default function EmpresaLayout({ children }: LayoutProps<'/empresa'>) {
  return <EmpresaShell>{children}</EmpresaShell>;
}
