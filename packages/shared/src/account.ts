// Conta do aluno/colaborador no app e na web: Hangar, preferências, progresso, empresa e planos.

export type AvatarSlot = 'SUIT' | 'DETAILS' | 'VISOR' | 'HEAD' | 'BACK';

export interface HangarItem {
  id: string;
  slot: AvatarSlot;
  /** chave do desenho (ex.: "branco", "jetpack") */
  key: string;
  name: string;
  colorHex: string | null;
  requiredLevel: number;
  premiumOnly: boolean;
  unlocked: boolean;
  equipped: boolean;
}

export interface Hangar {
  level: number;
  slots: Array<{ slot: AvatarSlot; items: HangarItem[] }>;
}

/** Abas do Hangar, na ordem e com os nomes do protótipo. */
export const HANGAR_SLOTS: Array<{ slot: AvatarSlot; label: string }> = [
  { slot: 'SUIT', label: 'Traje' },
  { slot: 'DETAILS', label: 'Detalhes' },
  { slot: 'VISOR', label: 'Viseira' },
  { slot: 'HEAD', label: 'Cabeça' },
  { slot: 'BACK', label: 'Costas' },
];

/** Roupa do astronauta no formato do desenho do protótipo ({ suit, accent, visor, head, back }). */
export type AstronautOutfit = Partial<Record<'suit' | 'accent' | 'visor' | 'head' | 'back', string>>;

const OUTFIT_KEY: Record<AvatarSlot, keyof AstronautOutfit> = { SUIT: 'suit', DETAILS: 'accent', VISOR: 'visor', HEAD: 'head', BACK: 'back' };

/** Itens equipados (ou um item que está sendo experimentado) viram a roupa do astronauta. */
export function outfitOf(h: Hangar | null | undefined, preview?: Pick<HangarItem, 'slot' | 'key'> | null): AstronautOutfit {
  const out: AstronautOutfit = {};
  for (const s of h?.slots ?? []) {
    const it = s.items.find((i) => i.equipped);
    if (it) out[OUTFIT_KEY[s.slot]] = it.key;
  }
  if (preview) out[OUTFIT_KEY[preview.slot]] = preview.key;
  return out;
}

export interface Preferences {
  soundEffects: boolean;
  questionTimer: boolean;
  reduceAnimations: boolean;
  /** narração em voz alta nos cursos que têm (Escola) */
  narration: boolean;
  dailyGoalXp: 20 | 50 | 100 | 150;
  dailyReminder: boolean;
  reminderTime: string;
  timezone: string;
}
export const DAILY_GOALS = [20, 50, 100, 150] as const;

export interface Progress {
  totalXp: number;
  level: number;
  xpInLevel: number;
  xpForNextLevel: number;
  levelProgressPct: number;
  streakDays: number;
  longestStreak: number;
  todayXp: number;
  dailyGoalXp: number;
  dailyGoalPct: number;
  last7Days: Array<{ date: string; xp: number }>;
}

export interface Entitlements {
  premium: boolean;
  premiumUntil: string | null;
  plan: { code: string; name: string; categories: string[] | 'ALL' } | null;
  company: boolean;
  library: boolean;
  minor: boolean;
  ads: boolean;
}

export interface MyCompany {
  company: { id: string; tradeName: string; initials: string | null; color: string | null; logoUrl: string | null };
  departments: Array<{ id: string; name: string }>;
  status: string | null;
  tracks: Array<{ assignmentId: string; title: string; courseIds: string[]; progress: number; progressPct: number; due: string | null; mandatory: boolean }>;
  ranking: Array<{ departmentId: string; name: string; completionPct: number; isMine: boolean }>;
}

export interface PublicTierPrice {
  id: string;
  code: string;
  name: string;
  interval: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'ONE_TIME';
  priceCents: number;
  currency: string;
  trialDays: number;
  appleProductId: string | null;
  googleProductId: string | null;
}

/** Plano de acesso na tela de assinatura (GET /billing/tiers). */
export interface PublicTier {
  code: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  includesAllCategories: boolean;
  sortOrder: number;
  categories: Array<{ slug: string; name: string }>;
  plans: PublicTierPrice[];
}

/** Assinatura do aluno (GET /billing/me/subscriptions). */
export interface MySubscription {
  id: string;
  provider: 'ASAAS' | 'APPLE' | 'GOOGLE' | 'REVENUECAT' | 'MANUAL' | string;
  status: 'PENDING' | 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED' | string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  amountCents: number | null;
  createdAt: string;
  plan: { name: string; interval: PublicTierPrice['interval']; priceCents: number; currency: string; tier: { code: string; name: string } | null };
}

/** Checkout web/PWA pelo Asaas (POST /billing/checkout): a fatura onde a pessoa paga. */
export interface CheckoutResult {
  subscriptionId: string;
  checkoutUrl: string | null;
  paymentId: string | null;
  dueDate: string;
  replaces: { subscriptionId: string; plan: string } | null;
}

export interface SubscriptionRefresh {
  subscriptionId: string;
  status: MySubscription['status'];
  active: boolean;
  currentPeriodEnd: string;
  plan: { name: string; interval: string };
}

/** CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00) enquanto a pessoa digita. */
export function maskDocument(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

/** Situação do colaborador na empresa (GET /me/company → status). */
export const COMPANY_STATUS_LABEL: Record<string, string> = {
  INVITED: 'Convite enviado',
  ON_TRACK: 'Em dia',
  LATE: 'Atrasado',
  NOT_STARTED: 'Não começou',
  DONE: 'Concluiu',
};
