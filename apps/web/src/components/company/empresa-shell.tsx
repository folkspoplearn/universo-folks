'use client';

import { PanelShell } from '../shells';
import { useSegment } from '../school/common';

type NavItem = { href: string; label: string; icon: string; exact?: boolean };

/** Menu do administrador da empresa (Cliente-Folks B2B). */
const COMPANY: NavItem[] = [
  { href: '/empresa', label: 'Visão geral', icon: '📊', exact: true },
  { href: '/empresa/pessoas', label: 'Pessoas', icon: '👥' },
  { href: '/empresa/departamentos', label: 'Departamentos', icon: '🗂️' },
  { href: '/empresa/planetas', label: 'Planetas liberados', icon: '🪐' },
  { href: '/empresa/trilhas', label: 'Trilhas obrigatórias', icon: '🧭' },
  { href: '/empresa/engajamento', label: 'Engajamento e relatórios', icon: '📈' },
  { href: '/empresa/configuracoes', label: 'Regras da empresa', icon: '⚙️' },
];

/** Menu do administrador da escola (ADR 0020). */
const SCHOOL: NavItem[] = [
  { href: '/empresa', label: 'Visão geral', icon: '📊', exact: true },
  { href: '/empresa/pessoas', label: 'Pessoas', icon: '👥' },
  { href: '/empresa/turmas', label: 'Turmas', icon: '🏫' },
  { href: '/empresa/professores', label: 'Professores', icon: '🧑‍🏫' },
  { href: '/empresa/planetas', label: 'Matérias liberadas', icon: '🪐' },
  { href: '/empresa/trilhas', label: 'Tarefas da escola', icon: '🧭' },
  { href: '/empresa/virada-de-ano', label: 'Virada de ano', icon: '🎓' },
  { href: '/empresa/transferencias', label: 'Transferências e pais', icon: '🔁' },
  { href: '/empresa/engajamento', label: 'Engajamento e relatórios', icon: '📈' },
  { href: '/empresa/configuracoes', label: 'Regras da escola', icon: '⚙️' },
];

/** Menu da secretaria de educação (B2G). */
const NETWORK: NavItem[] = [
  { href: '/empresa/rede', label: 'Visão da rede', icon: '🗺️' },
  { href: '/empresa/pessoas', label: 'Pessoas', icon: '👥' },
  { href: '/empresa/configuracoes', label: 'Regras', icon: '⚙️' },
];

/** Painel do administrador: o menu muda conforme a conta é empresa, escola ou secretaria. */
export function EmpresaShell({ children }: { children: React.ReactNode }) {
  const segment = useSegment();
  const nav = segment === 'SCHOOL' ? SCHOOL : segment === 'SCHOOL_NETWORK' ? NETWORK : COMPANY;
  const title = segment === 'SCHOOL' ? 'Painel da escola' : segment === 'SCHOOL_NETWORK' ? 'Painel da secretaria' : 'Painel da empresa';
  return <PanelShell area="empresa" title={title} nav={nav}>{children}</PanelShell>;
}
