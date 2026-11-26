import { PanelShell } from '@/components/shells';

/** Área do professor (escola, ADR 0020): turmas, relatórios, tarefas e cobrança. */
const NAV = [
  { href: '/professor', label: 'Minhas turmas', icon: '🏫', exact: true },
  { href: '/professor/tarefas', label: 'Tarefas', icon: '📝' },
];

export default function ProfessorLayout({ children }: LayoutProps<'/professor'>) {
  return <PanelShell area="professor" title="Área do professor" nav={NAV}>{children}</PanelShell>;
}
