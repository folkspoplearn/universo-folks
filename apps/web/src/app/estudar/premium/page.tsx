'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage, fmt, maskDocument, type MySubscription, type PublicTier, type PublicTierPrice } from '@folks/shared';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorBox, Loading, PageTitle, cx } from '@/components/ui';

const PER: Record<string, string> = { MONTHLY: 'por mês', QUARTERLY: 'por trimestre', YEARLY: 'por ano', ONE_TIME: 'pagamento único' };
const CYCLE: Record<string, string> = { MONTHLY: 'Mensal', QUARTERLY: 'Trimestral', YEARLY: 'Anual', ONE_TIME: 'Único' };
const ACTIVE = ['ACTIVE', 'TRIALING', 'PAST_DUE'];
const invoiceKey = (id: string) => `folks.checkout.${id}`;

/**
 * Premium do aluno individual na web: planos por galáxia (menu Planos do MASTER) pagos pelo Asaas
 * (Pix, cartão ou boleto na fatura). Mesmo fluxo do PWA (ADR 0019).
 */
export default function PremiumPage() {
  const { api, context } = useSession();
  const qc = useQueryClient();
  const tiers = useQuery({ queryKey: ['billing', 'tiers'], queryFn: () => api.billing.tiers() });
  const ent = useQuery({ queryKey: ['me', 'entitlements'], queryFn: () => api.me.entitlements() });
  const subs = useQuery({ queryKey: ['billing', 'mine'], queryFn: () => api.billing.mySubscriptions() });
  const [msg, setMsg] = useState<{ at: string; text: string; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openTier, setOpenTier] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [doc, setDoc] = useState('');

  const mine = subs.data ?? [];
  const pending = mine.find((x) => x.provider === 'ASAAS' && x.status === 'PENDING') ?? null;
  const active = mine.find((x) => ACTIVE.includes(x.status) && new Date(x.currentPeriodEnd) > new Date()) ?? null;

  async function afterChange() {
    await Promise.all([ent.refetch(), subs.refetch(), qc.invalidateQueries({ queryKey: ['trail'] }), qc.invalidateQueries({ queryKey: ['catalog'] })]);
  }

  // pagamento pendente: confere sozinho a cada 15 s (até 10 min)
  useEffect(() => {
    if (!pending) return;
    let n = 0;
    const t = setInterval(async () => {
      if (++n > 40) return clearInterval(t);
      try {
        const r = await api.billing.refresh(pending.id);
        if (r.active) { clearInterval(t); setMsg({ at: 'sub', text: `Pagamento confirmado! ${r.plan.name} liberado. 🎉`, ok: true }); await afterChange(); }
      } catch { /* tenta de novo */ }
    }, 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.id]);

  if (context && context.mode !== 'B2C') {
    return <><PageTitle title="Premium" /><Card><p className="text-muted">O Premium é para o aluno individual. Pela empresa, o acesso aos cursos é definido pelo seu administrador.</p></Card></>;
  }
  if (tiers.isLoading || ent.isLoading || subs.isLoading) return <Loading />;
  if (tiers.error) return <ErrorBox error={tiers.error} onRetry={() => tiers.refetch()} />;
  const list = tiers.data ?? [];
  const e = ent.data;
  const current = e?.plan?.code ?? (e?.premium ? null : list.find((t) => t.isDefault)?.code ?? null);
  const currentName = e?.plan?.name ?? (e?.premium ? 'Premium' : list.find((t) => t.isDefault)?.name ?? 'Básico');
  const currentOrder = list.find((t) => t.code === current)?.sortOrder ?? 0;
  const invoice = pending ? (typeof window !== 'undefined' ? window.localStorage.getItem(invoiceKey(pending.id)) : null) : null;

  async function checkout(tier: PublicTier, price: PublicTierPrice) {
    setMsg(null);
    const digits = doc.replace(/\D/g, '');
    if (digits.length !== 11 && digits.length !== 14) return setMsg({ at: tier.code, text: 'Informe o CPF (11 números) ou CNPJ (14 números).' });
    setBusy(tier.code);
    try {
      const r = await api.billing.checkout({ planId: price.id, cpfCnpj: digits });
      setOpenTier(null);
      setDoc('');
      await subs.refetch();
      if (r.checkoutUrl) {
        window.localStorage.setItem(invoiceKey(r.subscriptionId), r.checkoutUrl);
        // mesma aba: janela nova depois de esperar a API é bloqueada pelo Safari; ao voltar, o cartão
        // "Pagamento pendente" confere sozinho e libera o plano
        window.location.assign(r.checkoutUrl);
      } else setMsg({ at: 'sub', text: 'Cobrança criada. A fatura chega no seu e-mail.' });
    } catch (err) { setMsg({ at: tier.code, text: errorMessage(err) }); }
    finally { setBusy(null); }
  }

  async function checkPaid(s: MySubscription) {
    setMsg(null);
    setBusy('refresh');
    try {
      const r = await api.billing.refresh(s.id);
      if (r.active) { setMsg({ at: 'sub', text: `Pagamento confirmado! ${r.plan.name} liberado. 🎉`, ok: true }); await afterChange(); }
      else setMsg({ at: 'sub', text: 'Ainda não recebemos a confirmação. Pix e cartão confirmam em poucos minutos; boleto, em até 3 dias úteis.' });
    } catch (err) { setMsg({ at: 'sub', text: errorMessage(err) }); }
    finally { setBusy(null); }
  }

  async function cancel(s: MySubscription, question: string) {
    if (!window.confirm(question)) return;
    setMsg(null);
    setBusy('cancel');
    try {
      await api.billing.cancel(s.id);
      setMsg({ at: 'sub', text: s.status === 'PENDING' ? 'Cobrança cancelada.' : `Assinatura cancelada. Você continua com o ${s.plan.tier?.name ?? s.plan.name} até ${fmt.date(s.currentPeriodEnd)}.`, ok: true });
      await afterChange();
    } catch (err) { setMsg({ at: 'sub', text: errorMessage(err) }); }
    finally { setBusy(null); }
  }

  return (
    <>
      <PageTitle title="Folks Premium" subtitle="Tudo que é grátis continua grátis. O Premium abre o resto." />

      <Card className="mb-4 border-amber/40">
        <div className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden>{e?.premium ? '👑' : '🌱'}</span>
          <div className="flex-1">
            <div className="text-xs font-bold text-muted">SEU PLANO</div>
            <div className="text-lg font-black">{currentName}{active ? ` · ${CYCLE[active.plan.interval] ?? ''}` : ''}</div>
            {active && (
              <div className="text-sm text-muted">
                {active.cancelAtPeriodEnd ? `Cancelada: vale até ${fmt.date(active.currentPeriodEnd)}` : active.status === 'PAST_DUE' ? 'Pagamento em atraso: pague a fatura para não perder o acesso' : `Renova em ${fmt.date(active.currentPeriodEnd)}`}
              </div>
            )}
          </div>
          {active && active.provider === 'ASAAS' && !active.cancelAtPeriodEnd && (
            <button className="text-sm font-bold text-dim underline" disabled={busy === 'cancel'} onClick={() => cancel(active, `Cancelar a assinatura? Você continua com o Premium até ${fmt.date(active.currentPeriodEnd)} e não será cobrado de novo.`)}>Cancelar assinatura</button>
          )}
        </div>
      </Card>

      {pending && (
        <Card className="mb-4 border-amber/60 bg-amber/5">
          <div className="text-base font-black">⏳ Pagamento pendente · {pending.plan.name}</div>
          <p className="mt-1 text-sm text-muted">{fmt.money(pending.plan.priceCents, pending.plan.currency)} {PER[pending.plan.interval] ?? ''}. Assim que o Asaas confirmar, o plano é liberado sozinho.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {invoice && <Button onClick={() => window.open(invoice, '_blank', 'noopener')}>Abrir a fatura</Button>}
            <Button variant="ghost" loading={busy === 'refresh'} onClick={() => checkPaid(pending)}>Já paguei</Button>
            <button className="text-sm font-bold text-dim" onClick={() => cancel(pending, 'Cancelar esta cobrança?')}>Cancelar</button>
          </div>
        </Card>
      )}
      {msg?.at === 'sub' && <p role="alert" className={cx('mb-4 font-bold', msg.ok ? 'text-green' : 'text-amber')}>{msg.text}</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {list.map((t) => {
          const isCurrent = t.code === current;
          const prices = t.plans.filter((p) => p.priceCents > 0);
          const best = prices.find((p) => p.interval === 'YEARLY') ?? prices[0];
          const chosen = prices.find((p) => p.id === picked[t.code]) ?? best;
          const lower = !t.isDefault && !isCurrent && t.sortOrder < currentOrder;
          const action = isCurrent ? null : active && t.sortOrder > currentOrder ? `Mudar para ${t.name}` : `Assinar ${t.name}`;
          return (
            <Card key={t.code} className={cx('flex flex-col gap-3', isCurrent && 'border-2 border-amber')}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black">{t.name}</h2>
                {isCurrent && <span className="rounded-full bg-amber/15 px-3 py-1 text-xs font-black text-amber">Seu plano</span>}
              </div>
              {t.description && <p className="text-sm text-muted">{t.description}</p>}
              <div className="flex flex-wrap gap-1.5">
                {t.isDefault
                  ? <span className="rounded-full bg-green/15 px-2.5 py-1 text-xs font-black text-green">Cursos e unidades gratuitos</span>
                  : t.categories.map((c) => <span key={c.slug} className="rounded-full bg-purple/15 px-2.5 py-1 text-xs font-black text-purple">{c.name}</span>)}
              </div>
              {t.isDefault ? (
                <div className="text-xl font-black text-green">Grátis</div>
              ) : prices.length ? (
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Ciclo do ${t.name}`}>
                  {prices.map((p) => (
                    <button key={p.id} role="radio" aria-checked={p.id === chosen?.id} onClick={() => setPicked({ ...picked, [t.code]: p.id })}
                      className={cx('min-w-[100px] flex-1 rounded-2xl border p-3 text-left', p.id === chosen?.id ? 'border-2 border-amber' : 'border-line')}>
                      <div className="text-lg font-black">{fmt.money(p.priceCents, p.currency)}</div>
                      <div className="text-xs text-muted">{PER[p.interval] ?? ''}{p.trialDays ? ` · ${p.trialDays} dias grátis` : ''}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="font-bold text-dim">Preço em breve</div>
              )}

              {!t.isDefault && action && prices.length > 0 && (lower ? (
                <p className="text-sm text-dim">Para mudar para este plano, cancele o atual (ele vale até o fim do período) e assine depois.</p>
              ) : openTier === t.code ? (
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-bold text-muted" htmlFor={`doc-${t.code}`}>CPF ou CNPJ de quem paga</label>
                  <input id={`doc-${t.code}`} inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" maxLength={18} value={doc} onChange={(ev) => setDoc(maskDocument(ev.target.value))}
                    className="rounded-2xl border border-line bg-card-2 px-4 py-3 text-ink" />
                  <p className="text-xs text-dim">O Asaas exige o documento para emitir a cobrança. Você vai para a fatura do Asaas e escolhe Pix, cartão ou boleto. Depois de pagar, volte aqui.</p>
                  <Button loading={busy === t.code} onClick={() => checkout(t, chosen!)}>Ir para o pagamento · {fmt.money(chosen!.priceCents, chosen!.currency)}</Button>
                  <button className="text-sm font-bold text-dim" onClick={() => { setOpenTier(null); setMsg(null); }}>Voltar</button>
                </div>
              ) : (
                <Button disabled={!!pending} onClick={() => { setMsg(null); setOpenTier(t.code); }}>{action}</Button>
              ))}
              {pending && !isCurrent && !t.isDefault && openTier !== t.code && prices.length > 0 && !lower && <p className="text-xs text-dim">Há um pagamento pendente. Pague ou cancele antes de escolher outro plano.</p>}
              {msg?.at === t.code && <p role="alert" className="text-sm font-bold text-amber">{msg.text}</p>}
            </Card>
          );
        })}
      </div>
      <p className="mt-6 text-center text-xs text-dim">Pagamento seguro pelo Asaas. Pix e cartão liberam em minutos; boleto, em até 3 dias úteis. O cartão renova sozinho; Pix e boleto geram uma fatura nova a cada ciclo. Cancele quando quiser.</p>
    </>
  );
}
