import { BadRequestException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingInterval, PaymentStatus, Plan, Prisma, Subscription } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/types';
import { dayInTz } from '../common/utils';

export type AsaasBillingType = 'UNDEFINED' | 'PIX' | 'BOLETO' | 'CREDIT_CARD';

const CYCLE: Record<BillingInterval, string | null> = { MONTHLY: 'MONTHLY', QUARTERLY: 'QUARTERLY', YEARLY: 'YEARLY', ONE_TIME: null };
const PAID = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);

export function addInterval(start: Date, interval: BillingInterval): Date {
  const d = new Date(start);
  if (interval === 'MONTHLY') d.setUTCMonth(d.getUTCMonth() + 1);
  else if (interval === 'QUARTERLY') d.setUTCMonth(d.getUTCMonth() + 3);
  else if (interval === 'YEARLY') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 100);
  return d;
}

const today = () => dayInTz(new Date(), 'America/Sao_Paulo').toISOString().slice(0, 10);
/** Meia-noite de Brasília (UTC-3) do dia: o período vale até o início do dia do vencimento, no horário do aluno. */
export const brMidnight = (day: string) => new Date(`${day.slice(0, 10)}T03:00:00.000Z`);
const onlyDigits = (v: string) => v.replace(/\D/g, '');

/** CPF (11) ou CNPJ (14) com dígitos verificadores válidos: evita mandar documento errado ao Asaas. */
export function validDocument(raw: string): boolean {
  const d = onlyDigits(raw);
  if (/^(\d)\1+$/.test(d)) return false;
  const dv = (base: string, weights: number[]) => {
    const sum = base.split('').reduce((a, n, i) => a + Number(n) * weights[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  if (d.length === 11) {
    const w = (n: number) => Array.from({ length: n }, (_, i) => n + 1 - i);
    return dv(d.slice(0, 9), w(9)) === Number(d[9]) && dv(d.slice(0, 10), w(10)) === Number(d[10]);
  }
  if (d.length === 14) {
    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const w2 = [6, ...w1];
    return dv(d.slice(0, 12), w1) === Number(d[12]) && dv(d.slice(0, 13), w2) === Number(d[13]);
  }
  return false;
}

const STORE = new Set(['APPLE', 'GOOGLE', 'REVENUECAT']);

/**
 * Gateway Asaas (Pix, boleto e cartão).
 *  - Premium B2C na versão WEB (no app, as lojas exigem compra in-app -> RevenueCat)
 *  - Contratos de empresas B2B/B2G (boleto/Pix recorrente)
 *
 * Configuração:
 *   ASAAS_API_KEY        chave da conta (Integrações > Chave de API)
 *   ASAAS_API_URL        https://api-sandbox.asaas.com/v3 (sandbox) | https://api.asaas.com/v3 (produção)
 *   ASAAS_WEBHOOK_TOKEN  token de autenticação do webhook (header asaas-access-token)
 * Webhook: POST {APP_URL}/api/billing/webhooks/asaas, cadastrado com `node scripts/asaas-webhook.mjs configurar`.
 */
@Injectable()
export class AsaasService {
  private readonly log = new Logger(AsaasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  get enabled() {
    return !!this.config.get('ASAAS_API_KEY');
  }

  private get baseUrl() {
    return this.config.get<string>('ASAAS_API_URL', 'https://api-sandbox.asaas.com/v3').replace(/\/$/, '');
  }

  // ------------------------------------------------------------- clientes
  private async customerForUser(userId: string, cpfCnpj: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const doc = onlyDigits(cpfCnpj);
    if (!validDocument(doc)) throw new BadRequestException('CPF ou CNPJ inválido. Confira os números.');
    if (u.asaasCustomerId) {
      await this.request(`/customers/${u.asaasCustomerId}`, 'POST', { cpfCnpj: doc });
      return u.asaasCustomerId;
    }
    const c = await this.request('/customers', 'POST', { name: u.name, email: u.email, cpfCnpj: doc, externalReference: `user:${u.id}`, notificationDisabled: false });
    await this.prisma.user.update({ where: { id: u.id }, data: { asaasCustomerId: c.id } });
    return c.id as string;
  }

  private async customerForTenant(tenantId: string) {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (t.asaasCustomerId) return t.asaasCustomerId;
    if (!t.document) throw new BadRequestException('Cadastre o CNPJ da empresa antes de gerar a cobrança');
    const c = await this.request('/customers', 'POST', {
      name: t.legalName,
      company: t.tradeName,
      cpfCnpj: onlyDigits(t.document),
      email: t.contactEmail ?? undefined,
      mobilePhone: t.contactPhone ? onlyDigits(t.contactPhone) : undefined,
      externalReference: `tenant:${t.id}`,
    });
    await this.prisma.tenant.update({ where: { id: t.id }, data: { asaasCustomerId: c.id } });
    return c.id as string;
  }

  // ------------------------------------------------------- B2C (web)
  /**
   * Assinatura Premium na web/PWA. Devolve a fatura do Asaas, onde a pessoa paga com Pix, boleto ou cartão.
   * Troca de plano: subir de plano (Premium -> Premium Plus) ou trocar o ciclo (mensal <-> anual) gera a
   * nova cobrança; a assinatura antiga só é cancelada quando a nova for paga (ninguém fica sem acesso).
   * Descer de plano: cancele o atual (vale até o fim do período) e assine o outro depois.
   */
  async createB2CCheckout(user: AuthUser, planId: string, cpfCnpj: string, billingType: AsaasBillingType = 'UNDEFINED') {
    this.assertEnabled();
    if (user.mode !== 'B2C') throw new BadRequestException('O Premium é para o aluno individual. Troque para o perfil individual para assinar.');
    const plan = await this.prisma.plan.findFirst({ where: { id: planId, audience: 'B2C', isActive: true }, include: { tier: true } });
    if (!plan) throw new BadRequestException('Plano não encontrado ou inativo');
    if (plan.priceCents <= 0) throw new BadRequestException('Plano sem preço definido');
    const active = await this.prisma.subscription.findFirst({
      where: { userId: user.id, status: { in: ['ACTIVE', 'TRIALING'] }, currentPeriodEnd: { gt: new Date() }, plan: { audience: 'B2C' } },
      include: { plan: { include: { tier: true } } },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    if (active) {
      if (STORE.has(active.provider)) throw new BadRequestException('Sua assinatura é pela loja do celular. Para trocar de plano, use a Apple/Google.');
      if (active.planId === plan.id) throw new BadRequestException('Este já é o seu plano');
      const cur = active.plan.tier?.sortOrder ?? 0;
      const next = plan.tier?.sortOrder ?? 0;
      if (next < cur) throw new BadRequestException('Para mudar para um plano menor, cancele o atual (ele vale até o fim do período) e assine o outro depois.');
    }

    // checkout anterior não pago é substituído
    const pending = await this.prisma.subscription.findMany({ where: { userId: user.id, provider: 'ASAAS', status: 'PENDING' } });
    for (const p of pending) await this.cancelRemote(p).catch(() => undefined);
    await this.prisma.subscription.updateMany({ where: { id: { in: pending.map((p) => p.id) } }, data: { status: 'CANCELED', canceledAt: new Date() } });

    const customer = await this.customerForUser(user.id, cpfCnpj);
    const local = await this.prisma.subscription.create({
      data: { userId: user.id, planId: plan.id, provider: 'ASAAS', status: 'PENDING', amountCents: plan.priceCents, currentPeriodStart: new Date(), currentPeriodEnd: new Date() },
    });
    const { remoteId, payment } = await this.createRemote(customer, plan, plan.priceCents, billingType, today(), `sub:${local.id}`, `Universo Folks - ${plan.name}`);
    await this.prisma.subscription.update({ where: { id: local.id }, data: { providerSubscriptionId: remoteId } });
    if (payment) await this.upsertPayment(payment, local);
    await this.audit.log(user, 'asaas.b2c_checkout', 'subscription', local.id, { planId: plan.id, replaces: active?.id ?? null });
    return { subscriptionId: local.id, checkoutUrl: payment?.invoiceUrl ?? null, paymentId: payment?.id ?? null, dueDate: payment?.dueDate ?? today(), replaces: active ? { subscriptionId: active.id, plan: active.plan.name } : null };
  }

  /**
   * "Já paguei": confere no Asaas as cobranças da assinatura do aluno e aplica o resultado (mesma regra do
   * webhook). Serve quando o webhook atrasa ou ainda não está configurado.
   */
  async refreshForUser(user: AuthUser, subscriptionId: string) {
    this.assertEnabled();
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId: user.id, provider: 'ASAAS' } });
    if (!sub) throw new BadRequestException('Assinatura não encontrada');
    if (sub.providerSubscriptionId) {
      const payments: any[] = sub.providerSubscriptionId.startsWith('pay:')
        ? [await this.request(`/payments/${sub.providerSubscriptionId.slice(4)}`, 'GET')]
        : ((await this.request(`/subscriptions/${sub.providerSubscriptionId}/payments`, 'GET'))?.data ?? []);
      for (const p of payments) {
        const fresh = await this.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
        await this.applyPayment(PAID.has(p.status) ? 'PAYMENT_RECEIVED' : p.status === 'OVERDUE' ? 'PAYMENT_OVERDUE' : 'PAYMENT_UPDATED', p, fresh);
      }
    }
    const now = await this.prisma.subscription.findUniqueOrThrow({ where: { id: sub.id }, include: { plan: { select: { name: true, interval: true } } } });
    return { subscriptionId: now.id, status: now.status, plan: now.plan, currentPeriodEnd: now.currentPeriodEnd, active: now.status === 'ACTIVE' && now.currentPeriodEnd > new Date() };
  }

  // ------------------------------------------------- contratos B2B/B2G
  /** MASTER gera a cobrança recorrente do contrato da empresa (boleto/Pix). */
  async createTenantContract(
    me: AuthUser,
    tenantId: string,
    dto: { planId: string; valueCents?: number; seats?: number; adminSeats?: number; billingType?: AsaasBillingType; nextDueDate?: string; description?: string },
  ) {
    this.assertEnabled();
    const plan = await this.prisma.plan.findUniqueOrThrow({ where: { id: dto.planId } });
    if (plan.audience === 'B2C') throw new BadRequestException('Use um plano B2B/B2G para contratos de empresa');
    const value = dto.valueCents ?? plan.priceCents * (dto.seats ?? 1);
    if (value <= 0) throw new BadRequestException('Informe o valor do contrato (valueCents)');
    const customer = await this.customerForTenant(tenantId);
    const due = dto.nextDueDate ?? today();
    const start = brMidnight(due);
    const local = await this.prisma.subscription.create({
      data: {
        tenantId, planId: plan.id, provider: 'ASAAS', status: 'ACTIVE', seats: dto.seats, amountCents: value,
        currentPeriodStart: start, currentPeriodEnd: addInterval(start, plan.interval),
      },
    });
    const { remoteId, payment } = await this.createRemote(customer, plan, value, dto.billingType ?? 'BOLETO', due, `sub:${local.id}`, dto.description ?? `Universo Folks - ${plan.name}`);
    await this.prisma.subscription.update({ where: { id: local.id }, data: { providerSubscriptionId: remoteId } });
    if (payment) await this.upsertPayment(payment, local);
    if (dto.seats || dto.adminSeats) {
      await this.prisma.tenantSettings.update({
        where: { tenantId },
        data: { ...(dto.seats ? { maxCollaborators: dto.seats } : {}), ...(dto.adminSeats ? { maxAdmins: dto.adminSeats } : {}) },
      });
    }
    await this.audit.log(me, 'asaas.tenant_contract', 'subscription', local.id, { ...dto, value }, tenantId);
    return { subscriptionId: local.id, asaasId: remoteId, firstInvoiceUrl: payment?.invoiceUrl ?? null, valueCents: value, dueDate: due };
  }

  /** Assinatura recorrente (ou cobrança avulsa em planos ONE_TIME). */
  private async createRemote(customer: string, plan: Plan, valueCents: number, billingType: AsaasBillingType, dueDate: string, externalReference: string, description: string) {
    const cycle = CYCLE[plan.interval];
    if (!cycle) {
      const p = await this.request('/payments', 'POST', { customer, billingType, value: valueCents / 100, dueDate, description, externalReference });
      return { remoteId: `pay:${p.id}`, payment: p };
    }
    const sub = await this.request('/subscriptions', 'POST', { customer, billingType, value: valueCents / 100, nextDueDate: dueDate, cycle, description, externalReference });
    const list = await this.request(`/subscriptions/${sub.id}/payments`, 'GET').catch(() => ({ data: [] }));
    return { remoteId: sub.id as string, payment: list.data?.[0] ?? null };
  }

  async cancelRemote(sub: Subscription) {
    if (!sub.providerSubscriptionId || !this.enabled) return;
    if (sub.providerSubscriptionId.startsWith('pay:')) await this.request(`/payments/${sub.providerSubscriptionId.slice(4)}`, 'DELETE');
    else await this.request(`/subscriptions/${sub.providerSubscriptionId}`, 'DELETE');
  }

  // --------------------------------------------------------------- webhook
  assertWebhookToken(token?: string) {
    const expected = this.config.get<string>('ASAAS_WEBHOOK_TOKEN');
    if (!expected) throw new UnauthorizedException('ASAAS_WEBHOOK_TOKEN não configurado');
    const a = Buffer.from(token ?? '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
  }

  async handleWebhook(body: any) {
    const event: string = body?.event ?? '';
    const payment = body?.payment;
    const externalId: string = body?.id ?? `${event}:${payment?.id ?? body?.subscription?.id}:${payment?.status ?? ''}`;
    if (!event) return { ok: true, ignored: 'sem evento' };
    const exists = await this.prisma.webhookEvent.findUnique({ where: { provider_externalId: { provider: 'ASAAS', externalId } } });
    if (exists?.processedAt) return { ok: true, duplicate: true };
    let evt = exists;
    if (!evt) {
      try {
        evt = await this.prisma.webhookEvent.create({ data: { provider: 'ASAAS', externalId, type: event, payload: body as Prisma.InputJsonValue } });
      } catch (e) {
        // o Asaas entrega "pelo menos uma vez": a mesma notificação pode chegar duas vezes ao mesmo tempo
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: true, duplicate: true };
        throw e;
      }
    }
    try {
      const r = await this.process(event, body);
      await this.prisma.webhookEvent.update({ where: { id: evt.id }, data: { processedAt: new Date(), error: null } });
      return { ok: true, ...r };
    } catch (e: any) {
      await this.prisma.webhookEvent.update({ where: { id: evt.id }, data: { error: String(e?.message ?? e) } });
      throw e;
    }
  }

  private async process(event: string, body: any) {
    if (event.startsWith('SUBSCRIPTION_')) {
      const remote = body.subscription;
      if (!remote?.id) return { ignored: event };
      const sub = await this.prisma.subscription.findUnique({ where: { provider_providerSubscriptionId: { provider: 'ASAAS', providerSubscriptionId: remote.id } } });
      if (!sub) return { ignored: 'assinatura desconhecida' };
      if (event === 'SUBSCRIPTION_DELETED' || event === 'SUBSCRIPTION_INACTIVATED') {
        await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: sub.status === 'PENDING' ? 'CANCELED' : sub.status, cancelAtPeriodEnd: true, canceledAt: new Date() } });
      }
      return { subscriptionId: sub.id };
    }
    if (!event.startsWith('PAYMENT_')) return { ignored: event };
    const p = body.payment;
    if (!p?.id) return { ignored: 'sem cobrança' };
    const sub = await this.findSubscription(p);
    if (!sub) {
      this.log.warn(`Asaas ${event}: cobrança ${p.id} sem assinatura local`);
      return { ignored: 'assinatura desconhecida' };
    }
    return this.applyPayment(event, p, sub);
  }

  /** Aplica uma cobrança do Asaas à assinatura local (webhook e "Já paguei"). */
  private async applyPayment(event: string, p: any, sub: Subscription) {
    const status = await this.upsertPayment(p, sub, event === 'PAYMENT_DELETED' ? 'FAILED' : undefined);
    const plan = await this.prisma.plan.findUniqueOrThrow({ where: { id: sub.planId } });

    if (status === 'PAID') {
      const base = brMidnight(p.dueDate ?? today());
      const newEnd = addInterval(base, plan.interval);
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'ACTIVE',
          currentPeriodStart: sub.status === 'PENDING' ? new Date() : sub.currentPeriodStart,
          currentPeriodEnd: newEnd > sub.currentPeriodEnd ? newEnd : sub.currentPeriodEnd,
        },
      });
      // troca de plano: a nova foi paga, então a antiga (Asaas) é encerrada agora
      if (sub.userId && sub.status === 'PENDING' && plan.audience === 'B2C') await this.replaceOthers(sub);
    } else if (event === 'PAYMENT_OVERDUE') {
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: sub.status === 'PENDING' ? 'PENDING' : 'PAST_DUE' } });
      if (sub.tenantId) await this.audit.log(null, 'asaas.tenant_overdue', 'tenant', sub.tenantId, { paymentId: p.id, dueDate: p.dueDate }, sub.tenantId);
    } else if (event === 'PAYMENT_REFUNDED' && sub.userId) {
      await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELED', canceledAt: new Date(), currentPeriodEnd: new Date() } });
    }
    return { subscriptionId: sub.id, paymentStatus: status };
  }

  private async replaceOthers(paid: Subscription) {
    const others = await this.prisma.subscription.findMany({
      where: { userId: paid.userId, id: { not: paid.id }, provider: 'ASAAS', status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] }, plan: { audience: 'B2C' } },
    });
    for (const o of others) {
      await this.cancelRemote(o).catch((e) => this.log.warn(`não cancelou ${o.id} no Asaas: ${e?.message ?? e}`));
      await this.prisma.subscription.update({ where: { id: o.id }, data: { status: 'CANCELED', canceledAt: new Date(), currentPeriodEnd: new Date() } });
      await this.audit.log(null, 'asaas.b2c_replaced', 'subscription', o.id, { by: paid.id });
    }
  }

  private async findSubscription(p: any) {
    if (p.subscription) {
      const s = await this.prisma.subscription.findUnique({ where: { provider_providerSubscriptionId: { provider: 'ASAAS', providerSubscriptionId: p.subscription } } });
      if (s) return s;
    }
    const ref: string | undefined = p.externalReference;
    if (ref?.startsWith('sub:')) return this.prisma.subscription.findUnique({ where: { id: ref.slice(4) } });
    return this.prisma.subscription.findUnique({ where: { provider_providerSubscriptionId: { provider: 'ASAAS', providerSubscriptionId: `pay:${p.id}` } } });
  }

  private async upsertPayment(p: any, sub: Subscription, forced?: PaymentStatus): Promise<PaymentStatus> {
    const status: PaymentStatus = forced ?? (PAID.has(p.status) ? 'PAID' : p.status === 'REFUNDED' || p.status === 'REFUND_REQUESTED' ? 'REFUNDED' : 'PENDING');
    const data = {
      amountCents: Math.round(Number(p.value ?? 0) * 100),
      status,
      paidAt: status === 'PAID' ? new Date(p.clientPaymentDate ?? p.paymentDate ?? p.confirmedDate ?? Date.now()) : null,
      description: `${p.billingType ?? ''} venc. ${p.dueDate ?? ''}${p.invoiceUrl ? ` · ${p.invoiceUrl}` : ''}`.trim(),
      raw: p as Prisma.InputJsonValue,
    };
    await this.prisma.payment.upsert({
      where: { provider_providerPaymentId: { provider: 'ASAAS', providerPaymentId: p.id } },
      create: { ...data, provider: 'ASAAS', providerPaymentId: p.id, subscriptionId: sub.id, userId: sub.userId, tenantId: sub.tenantId, currency: 'BRL' },
      update: data,
    });
    return status;
  }

  // ---------------------------------------------------------------- http
  private assertEnabled() {
    if (!this.enabled) throw new ServiceUnavailableException('Pagamento pelo Asaas ainda não configurado (ASAAS_API_KEY)');
  }

  private async request(path: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        access_token: this.config.get<string>('ASAAS_API_KEY')!,
        'Content-Type': 'application/json',
        'User-Agent': 'universo-folks-api',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const msg = json?.errors?.map((e: any) => e.description).join('; ') || `HTTP ${res.status}`;
      this.log.error(`Asaas ${method} ${path}: ${msg}`);
      throw new BadRequestException(`Asaas: ${msg}`);
    }
    return json;
  }
}
