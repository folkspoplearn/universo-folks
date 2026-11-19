# ADR 0019 — Premium do aluno pago pelo Asaas na web e no PWA

> tags: adr, premium, premium plus, assinatura, asaas, pix, cartão, boleto, checkout, cpf, revenuecat, lojas, apple, google, pwa, troca de plano, upgrade, já paguei | status: aceita | data: 2026-11-18

## Contexto
- Os planos de acesso por galáxia (Básico, Premium, Premium Plus; ADR 0014) existiam, mas ninguém conseguia pagar:
  - o app esperava a compra pelas lojas (RevenueCat), e ele ainda não está nas lojas;
  - a web não tinha tela de assinatura;
  - o PWA (ADR 0018) é a forma de uso até a publicação.
- A API já falava com o Asaas (checkout B2C e contratos), mas só tinha sido testada contra uma API simulada e não tratava a troca de plano.
- O cliente tem conta no Asaas e decidiu em 2026-11-18:
  - testar primeiro no sandbox;
  - aceitar Pix, cartão e boleto, com o aluno escolhendo na fatura;
  - ciclos mensal e anual, com o preço definido pelo MASTER.

## Decisão
- **Web e PWA pagam pelo Asaas. O app das lojas paga pela RevenueCat**, porque a Apple e o Google exigem compra in-app para conteúdo digital. A aba Premium decide pela plataforma (`Platform.OS === 'web'`).
- **Fluxo:**
  1. Escolher o plano e o ciclo.
  2. Informar o CPF/CNPJ, exigido pelo Asaas e validado pelos dígitos. A plataforma guarda só o id do cliente no Asaas.
  3. Ir para a fatura do Asaas na mesma aba e pagar.
  4. Ao voltar, o cartão "Pagamento pendente" confere sozinho a cada 15 s e tem "Já paguei" (`POST /billing/subscriptions/:id/refresh`, que consulta o Asaas). O webhook continua sendo o caminho principal.
- **Troca de plano:** subir de plano ou trocar o ciclo gera nova cobrança. A assinatura antiga é cancelada só quando a nova é paga, para não deixar ninguém sem acesso nem cobrar duas vezes. Descer de plano exige cancelar antes.
- **Cancelar:** a assinatura paga vale até o fim do período; a cobrança pendente some na hora.
- **Período:** termina à meia-noite de Brasília do dia do vencimento, para a data mostrada ("Renova em …") ser a mesma do vencimento.
- **Preços:** a migração `planos_premium_plus` garante os 4 preços B2C (Premium e Premium Plus, mensal e anual), desativados e com preço zero, em todo banco novo. O MASTER ativa e define o valor no menu Planos.
- **Telas:** aba Premium do app (versão web/PWA) e `/estudar/premium` na web. Esta aparece no menu só no perfil individual.

## Alternativas descartadas
- **Cartão direto na plataforma** (checkout transparente): traria dados de cartão para o nosso sistema (PCI) e mais telas. A fatura do Asaas já resolve Pix, cartão e boleto.
- **Crédito proporcional na troca de plano:** é mais complexo e o Asaas não faz sozinho. Fica como melhoria se o cliente pedir.
- **Abrir a fatura numa janela nova:** o Safari e o PWA bloqueiam janela aberta depois de esperar a API.

## Consequências
- Antes da publicação nas lojas, o aluno assina pelo PWA ou pela web.
- Depois, quem assinou pela web continua pagando pelo Asaas, e quem assinar no app paga pela loja. As duas assinaturas liberam o mesmo plano de acesso.
- O webhook do Asaas precisa estar configurado em produção. Sem ele, a liberação depende do aluno abrir a tela Premium (conferência automática ou "Já paguei").
- Boleto leva até 3 dias úteis para liberar.

## Pendências
- ~~Testar no sandbox real~~: feito em 2026-11-19 (13/13). Falta o webhook apontando para a API publicada na Vercel.
- Definir os preços reais no menu Planos e ativar.
- Passar para a chave de produção (`ASAAS_API_URL` de produção) na Vercel.
