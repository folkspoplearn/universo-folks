import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, errorMessage, fmt, maskDocument, radius, type MySubscription, type PublicTier, type PublicTierPrice } from '@folks/shared';
import { useSession } from '@/lib/session';
import { storePurchases } from '@/lib/purchases';
import { Astronaut } from '@/components/space/astronaut';
import { Button, Card, ErrorBox, Loading, Screen, Text, s as ui } from '@/components/ui';

const PER: Record<string, string> = { MONTHLY: 'por mês', QUARTERLY: 'por trimestre', YEARLY: 'por ano', ONE_TIME: 'pagamento único' };
const CYCLE: Record<string, string> = { MONTHLY: 'Mensal', QUARTERLY: 'Trimestral', YEARLY: 'Anual', ONE_TIME: 'Único' };

const BENEFITS: [string, string, string][] = [
  ['🪐', 'Galáxias completas.', 'Todas as unidades e o desafio final dos cursos das galáxias do seu plano.'],
  ['🎓', 'Certificados.', 'Comunicação, Liderança, Feedback e mais, com certificado.'],
  ['♾️', 'Prática infinita sem limite.', 'Em todos os cursos, sem esperar o dia seguinte.'],
  ['🚫', 'Sem anúncios.', 'Estude sem interrupção.'],
];

/** Web/PWA paga pelo Asaas (ADR 0018/0019). App das lojas: compra in-app (RevenueCat), exigência da Apple/Google. */
const WEB = Platform.OS === 'web';
const ACTIVE = ['ACTIVE', 'TRIALING', 'PAST_DUE'];

/** link da fatura guardado no aparelho para "Abrir a fatura" depois (a API não devolve o link de novo) */
const invoiceKey = (id: string) => `folks.checkout.${id}`;
const saveInvoice = (id: string, url: string) => { try { globalThis.localStorage?.setItem(invoiceKey(id), url); } catch { /* sem armazenamento */ } };
const loadInvoice = (id: string) => { try { return globalThis.localStorage?.getItem(invoiceKey(id)) ?? null; } catch { return null; } };

/**
 * Aba Premium do aluno (B2C): planos de acesso por galáxia (Básico, Premium, Premium Plus) definidos
 * pelo MASTER no menu Planos.
 */
export default function Premium() {
  const { api, user } = useSession();
  const qc = useQueryClient();
  const tiers = useQuery({ queryKey: ['billing', 'tiers'], queryFn: () => api.billing.tiers() });
  const ent = useQuery({ queryKey: ['me', 'entitlements'], queryFn: () => api.me.entitlements() });
  const subs = useQuery({ queryKey: ['billing', 'mine'], queryFn: () => api.billing.mySubscriptions(), enabled: WEB });
  // mensagem perto de onde a pessoa tocou: no card do plano, na assinatura ou embaixo (restaurar compras)
  const [msg, setMsg] = useState<{ at: string; text: string; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openTier, setOpenTier] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [doc, setDoc] = useState('');

  const list = tiers.data ?? [];
  const mine = subs.data ?? [];
  const pending = mine.find((x) => x.provider === 'ASAAS' && x.status === 'PENDING') ?? null;
  const active = mine.find((x) => ACTIVE.includes(x.status) && new Date(x.currentPeriodEnd) > new Date()) ?? null;

  async function afterChange() {
    await Promise.all([ent.refetch(), subs.refetch(), qc.invalidateQueries({ queryKey: ['trail'] }), qc.invalidateQueries({ queryKey: ['catalog'] })]);
  }

  // pagamento pendente: confere sozinho a cada 15 s (até 10 min) enquanto a tela está aberta
  useEffect(() => {
    if (!WEB || !pending) return;
    let n = 0;
    const t = setInterval(async () => {
      if (++n > 40) return clearInterval(t);
      try {
        const r = await api.billing.refresh(pending.id);
        if (r.active) { clearInterval(t); setMsg({ at: 'sub', text: `Pagamento confirmado! ${r.plan.name} liberado. 🎉`, ok: true }); await afterChange(); }
      } catch { /* tenta de novo no próximo ciclo */ }
    }, 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.id]);

  if (tiers.isLoading || ent.isLoading || (WEB && subs.isLoading)) return <Screen><Loading /></Screen>;
  if (tiers.error) return <Screen><ErrorBox error={tiers.error} onRetry={() => tiers.refetch()} /></Screen>;
  const e = ent.data;
  // plano atual: o da assinatura; sem plano informado, Premium antigo (libera tudo) ou o Básico
  const current = e?.plan?.code ?? (e?.premium ? null : list.find((t) => t.isDefault)?.code ?? null);
  const currentName = e?.plan?.name ?? (e?.premium ? 'Premium' : list.find((t) => t.isDefault)?.name ?? 'Básico');
  const currentOrder = list.find((t) => t.code === current)?.sortOrder ?? 0;

  async function buyInStore(tier: PublicTier, price: PublicTierPrice | undefined) {
    setMsg(null);
    if (!storePurchases.available || !price || !user) { setMsg({ at: tier.code, text: storePurchases.reason ?? 'Preço ainda não disponível para este plano.' }); return; }
    setBusy(tier.code);
    try {
      await storePurchases.buy(price, user.id);
      setMsg({ at: tier.code, text: 'Compra enviada. O Premium é liberado assim que a loja confirmar.' });
      void ent.refetch();
    } catch (err) { setMsg({ at: tier.code, text: errorMessage(err) }); }
    finally { setBusy(null); }
  }

  async function checkout(tier: PublicTier, price: PublicTierPrice) {
    setMsg(null);
    const digits = doc.replace(/\D/g, '');
    if (digits.length !== 11 && digits.length !== 14) { setMsg({ at: tier.code, text: 'Informe o CPF (11 números) ou CNPJ (14 números).' }); return; }
    setBusy(tier.code);
    try {
      const r = await api.billing.checkout({ planId: price.id, cpfCnpj: digits });
      setOpenTier(null);
      setDoc('');
      await subs.refetch();
      if (r.checkoutUrl) {
        saveInvoice(r.subscriptionId, r.checkoutUrl);
        // mesma aba: abrir janela nova depois de esperar a API é bloqueado (Safari/PWA). Ao voltar, o
        // cartão "Pagamento pendente" confere sozinho e libera o plano.
        globalThis.location?.assign(r.checkoutUrl);
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

  async function cancel(s: MySubscription, what: string) {
    if (typeof globalThis.confirm === 'function' && !globalThis.confirm(what)) return;
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
    <Screen>
      <View style={{ alignItems: 'center', paddingTop: 4 }}>
        <Astronaut mood="celebrate" width={130} />
        <Text weight="black" size={13} style={{ color: '#ffe08a', letterSpacing: 1, marginTop: 4 }}>FOLKS PREMIUM</Text>
        <Text weight="black" size={28} style={{ textAlign: 'center' }}>Explore o universo inteiro</Text>
        <Text weight="semibold" tone="muted" style={{ textAlign: 'center', marginTop: 4 }}>Tudo que é grátis continua grátis. O Premium abre o resto.</Text>
      </View>

      <Card style={{ marginTop: 16, gap: 10, borderColor: `${colors.amber}55` }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text size={26}>{e?.premium ? '👑' : '🌱'}</Text>
          <View style={{ flex: 1 }}>
            <Text tone="muted" size={12} weight="bold">SEU PLANO</Text>
            <Text weight="black" size={17}>{currentName}{active ? ` · ${CYCLE[active.plan.interval] ?? ''}` : ''}</Text>
            {active ? (
              <Text tone="muted" size={13}>{active.cancelAtPeriodEnd ? `Cancelada: vale até ${fmt.date(active.currentPeriodEnd)}` : active.status === 'PAST_DUE' ? 'Pagamento em atraso: pague a fatura para não perder o acesso' : `Renova em ${fmt.date(active.currentPeriodEnd)}`}</Text>
            ) : e?.premiumUntil ? <Text tone="muted" size={13}>Válido até {fmt.date(e.premiumUntil)}</Text> : null}
          </View>
        </View>
        {WEB && active && active.provider === 'ASAAS' && !active.cancelAtPeriodEnd && (
          <Pressable onPress={() => cancel(active, `Cancelar a assinatura? Você continua com o Premium até ${fmt.date(active.currentPeriodEnd)} e não será cobrado de novo.`)} accessibilityRole="button" disabled={busy === 'cancel'}>
            <Text tone="dim" weight="bold" size={13} style={{ textDecorationLine: 'underline' }}>Cancelar assinatura</Text>
          </Pressable>
        )}
      </Card>

      {WEB && pending && (
        <Card style={{ marginTop: 12, gap: 10, borderColor: `${colors.amber}88`, backgroundColor: `${colors.amber}12` }}>
          <Text weight="black" size={16}>⏳ Pagamento pendente · {pending.plan.name}</Text>
          <Text tone="muted" size={14}>{fmt.money(pending.plan.priceCents, pending.plan.currency)} {PER[pending.plan.interval] ?? ''}. Assim que o Asaas confirmar, o plano é liberado sozinho.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            {loadInvoice(pending.id) && <Button title="Abrir a fatura" onPress={() => void Linking.openURL(loadInvoice(pending.id)!)} style={{ paddingVertical: 10, paddingHorizontal: 16 }} />}
            <Button title="Já paguei" variant="ghost" onPress={() => checkPaid(pending)} loading={busy === 'refresh'} style={{ paddingVertical: 10, paddingHorizontal: 16 }} />
            <Pressable onPress={() => cancel(pending, 'Cancelar esta cobrança?')} accessibilityRole="button"><Text tone="dim" weight="bold" size={13}>Cancelar</Text></Pressable>
          </View>
        </Card>
      )}
      {msg?.at === 'sub' && <Text weight="bold" size={14} style={{ marginTop: 10, color: msg.ok ? colors.green : colors.amber }} accessibilityRole="alert">{msg.text}</Text>}

      <Card style={{ marginTop: 14, gap: 12 }}>
        {BENEFITS.map(([ic, b, t]) => (
          <View key={b} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <Text size={20}>{ic}</Text>
            <Text style={{ flex: 1 }} tone="muted"><Text weight="black">{b}</Text> {t}</Text>
          </View>
        ))}
      </Card>

      <Text weight="black" size={19} style={{ marginTop: 22 }}>Planos</Text>
      <View style={{ gap: 12, marginTop: 10 }}>
        {list.map((t) => {
          const isCurrent = t.code === current;
          const prices = t.plans.filter((p) => p.priceCents > 0);
          const best = prices.find((p) => p.interval === 'YEARLY') ?? prices[0];
          const chosen = prices.find((p) => p.id === picked[t.code]) ?? best;
          const lower = !t.isDefault && !isCurrent && t.sortOrder < currentOrder;
          const action = isCurrent ? null : active && t.sortOrder > currentOrder ? `Mudar para ${t.name}` : `Assinar ${t.name}`;
          return (
            <Card key={t.code} style={[{ gap: 10 }, isCurrent && { borderColor: colors.amber, borderWidth: 2 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text weight="black" size={18}>{t.name}</Text>
                {isCurrent && <Pill label="Seu plano" color={colors.amber} />}
              </View>
              {t.description ? <Text tone="muted" size={14}>{t.description}</Text> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {t.isDefault
                  ? <Pill label="Cursos e unidades gratuitos" color={colors.green} />
                  : t.categories.map((c) => <Pill key={c.slug} label={c.name} color={colors.purple} />)}
              </View>
              {t.isDefault ? (
                <Text weight="black" size={20} tone="green">Grátis</Text>
              ) : prices.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {prices.map((p) => {
                    const sel = WEB ? p.id === chosen?.id : p === best;
                    return (
                      <Pressable key={p.id} disabled={!WEB} onPress={() => setPicked({ ...picked, [t.code]: p.id })} accessibilityRole={WEB ? 'radio' : undefined} accessibilityState={{ selected: sel }}
                        style={{ flexGrow: 1, flexBasis: 0, minWidth: 100, padding: 10, borderRadius: radius.md, borderWidth: sel ? 2 : 1, borderColor: sel ? colors.amber : colors.cardBorder }}>
                        <Text weight="black" size={18}>{fmt.money(p.priceCents, p.currency)}</Text>
                        <Text tone="muted" size={12}>{PER[p.interval] ?? ''}{p.trialDays ? ` · ${p.trialDays} dias grátis` : ''}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Text tone="dim" weight="bold">Preço em breve</Text>
              )}

              {!t.isDefault && action && prices.length > 0 && (WEB ? (
                lower ? (
                  <Text tone="dim" size={13}>Para mudar para este plano, cancele o atual (ele vale até o fim do período) e assine depois.</Text>
                ) : openTier === t.code ? (
                  <View style={{ gap: 8 }}>
                    <Text weight="bold" size={13} tone="muted">CPF ou CNPJ de quem paga</Text>
                    <TextInput value={doc} onChangeText={(v) => setDoc(maskDocument(v))} keyboardType="number-pad" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" placeholderTextColor={colors.dim} accessibilityLabel="CPF ou CNPJ de quem paga" style={ui.input} maxLength={18} />
                    <Text tone="dim" size={12}>O Asaas exige o documento para emitir a cobrança. Você vai para a fatura do Asaas e escolhe Pix, cartão ou boleto. Depois de pagar, volte ao app.</Text>
                    <Button title={`Ir para o pagamento · ${fmt.money(chosen!.priceCents, chosen!.currency)}`} onPress={() => checkout(t, chosen!)} loading={busy === t.code} />
                    <Pressable onPress={() => { setOpenTier(null); setMsg(null); }} accessibilityRole="button" style={{ alignSelf: 'center' }}><Text tone="dim" weight="bold" size={13}>Voltar</Text></Pressable>
                  </View>
                ) : (
                  <Button title={action} onPress={() => { setMsg(null); setOpenTier(t.code); }} disabled={!!pending} />
                )
              ) : (
                <Button title={action} onPress={() => buyInStore(t, best)} loading={busy === t.code} />
              ))}
              {WEB && pending && !isCurrent && !t.isDefault && openTier !== t.code && prices.length > 0 && !lower && <Text tone="dim" size={12}>Há um pagamento pendente. Pague ou cancele antes de escolher outro plano.</Text>}
              {msg?.at === t.code && <Text tone="amber" weight="bold" size={14} accessibilityRole="alert">{msg.text}</Text>}
            </Card>
          );
        })}
      </View>

      {WEB ? (
        <Text tone="dim" size={12} style={{ textAlign: 'center', marginTop: 18 }}>Pagamento seguro pelo Asaas. Pix e cartão liberam em minutos; boleto, em até 3 dias úteis. O cartão renova sozinho; Pix e boleto geram uma fatura nova a cada ciclo. Cancele quando quiser.</Text>
      ) : (
        <>
          <Pressable onPress={async () => { setMsg(null); try { await storePurchases.restore(user?.id ?? ''); void ent.refetch(); } catch (err) { setMsg({ at: 'restore', text: errorMessage(err) }); } }} accessibilityRole="button" style={{ alignSelf: 'center', marginTop: 18, padding: 8 }}>
            <Text weight="bold" tone="muted" style={{ textDecorationLine: 'underline' }}>Restaurar compras</Text>
          </Pressable>
          {msg?.at === 'restore' && <Text tone="amber" weight="bold" size={14} style={{ textAlign: 'center' }} accessibilityRole="alert">{msg.text}</Text>}
          <Text tone="dim" size={12} style={{ textAlign: 'center', marginTop: 6 }}>A assinatura renova sozinha e pode ser cancelada a qualquer momento na loja (App Store ou Google Play).</Text>
        </>
      )}
    </Screen>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: `${color}22`, borderWidth: 1, borderColor: `${color}55` }}>
      <Text weight="black" size={12} style={{ color }}>{label}</Text>
    </View>
  );
}
