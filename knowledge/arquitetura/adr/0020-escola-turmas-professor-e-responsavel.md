# ADR 0020 — Escola: turmas, professor, responsável e rede de ensino

> tags: adr, escola, b2g, secretaria, rede, turma, série, professor, aluno, responsável, pais, lição de casa, tarefa, relatório, virada de ano, transferência, menor de idade, eca digital, aviso, cobrança | status: aceita | data: 2026-11-26

## Contexto
- A galáxia "Para a escola" tem conteúdo da 1ª série do fundamental à 3ª do médio, mas só para o aluno estudar sozinho.
- O cliente quer vender para **escolas particulares, estaduais e municipais**. Decidiu em 2026-11-26:
  - acesso de **administrador da escola**: cria contas e gerencia tudo;
  - acesso de **professor**: tem as matérias que ensina e os alunos delas; tira relatório só dos seus alunos e passa tarefas;
  - acesso de **aluno**;
  - acesso de **responsável (pai/mãe)**: dá as autorizações exigidas por lei e vê o desempenho e o histórico do filho. É o mesmo acesso para a criança avulsa, sem escola;
  - no B2G, a **secretaria** tem um acesso que vê todas as escolas, alunos e professores;
  - o gestor cria **várias turmas por série** (1º ano A, B, C);
  - o professor passa uma matéria como **lição de casa ou só estudo**, com **prazo ou em aberto**, e **cobra pelo app**;
  - **virada do ano letivo** com um botão (todos do 1º vão para o 2º), com exceção manual para quem repete;
  - **mudança de escola** sem perder histórico: o login é do aluno; a escola só libera o Premium e, ao sair, ele volta ao gratuito;
  - escola **paga por licença de usuário**, como no B2B;
  - escola não tem anúncio nem compra.
- O espaço da empresa já tem quase tudo: departamentos com setor pai, planetas liberados por departamento, trilhas obrigatórias com prazo, situação de cada pessoa, lembrete e relatório CSV.

## Decisão
**A escola é um tenant, como a empresa.** Não há módulo paralelo: o que muda é o segmento, um papel novo e algumas tabelas.

| Escola | No banco |
|---|---|
| Escola | `Tenant` com `segment = SCHOOL` |
| Secretaria (B2G) | `Tenant` com `segment = SCHOOL_NETWORK`; as escolas apontam para ela em `networkId` |
| Administrador da escola | `ADMIN_CLIENTE` (como na empresa) |
| Professor | `PROFESSOR` (papel novo em `TenantRole`) |
| Aluno | `COLABORADOR_CLIENTE` |
| Série | `Department` com `kind = GRADE` e `grade` ("1"…"9", "m1"…"m3") |
| Turma | `Department` com `kind = CLASS`, filho da série |
| Matéria do professor na turma | `TeachingAssignment` (professor × turma × planeta) |
| Lição de casa / estudo | `Assignment` existente: `mandatory = true` é lição de casa, `false` é estudo; `dueDate` nulo = em aberto |
| Cobrança pelo app | `Notice` (aviso na caixa do aluno) + e-mail; o push entra quando o `PushSender` for ligado |
| Responsável | `GuardianLink` (responsável × aluno), com consentimento datado |

### Regras
- **Licenças:** professor ocupa licença de usuário, na mesma cota dos alunos (`maxCollaborators`), porque o preço é por usuário. Administrador continua na cota própria.
- **Escopo do professor:** só enxerga as turmas e os planetas do seu `TeachingAssignment`. Tudo passa por `TeacherScope` (`backend/src/school/teacher-scope.ts`); nenhuma rota do professor recebe `tenantId` do cliente.
- **Tarefa do professor:** só para turma + planeta (ou curso desse planeta) que ele ensina. Ele edita e apaga só as tarefas das suas turmas e matérias.
- **Matérias da série:** ao criar uma turma, os planetas da Escola com a mesma `grade` são liberados para ela. `Planet.grade` passa a ser gravado pela importação (o campo já existia no `folks.content/v1`).
- **Virada de ano:** `POST companies/:tenant/school/rollover`. Da série mais alta para a mais baixa, cada turma passa para a turma de mesma letra da série seguinte (criada se faltar). Quem está em `keepBack` fica na série atual. Na 3ª série do médio, os alunos saem da turma (formados) e o administrador decide se libera a licença. O professor continua ligado à turma de origem.
- **Transferência:** a nova escola pede (`POST companies/:tenant/school/transfers`), o aluno recebe um código por e-mail e aceita (`POST /me/school-transfer/accept`). A matrícula antiga é desativada (não apagada) e a nova é criada. O histórico é da pessoa, não da escola.
- **Privacidade entre escolas:** o relatório da escola mostra só o conteúdo liberado por ela. A nova escola não vê as tarefas nem a situação da antiga.
- **Responsável:**
  - cria a conta do filho (avulso) e já fica ligado, com o consentimento registrado; ou
  - liga-se a um aluno de escola com um código que o próprio aluno ou o administrador da escola gera.
  - Vê cursos, progresso, tarefas e última atividade do filho. Não vê reflexões (ADR 0011).
- **Menores e anúncios:** escola nunca tem anúncio nem compra (já era regra para empresa). Para a criança avulsa:
  - o ECA Digital (Lei 15.211/2025, em vigor desde 17/03/2026) proíbe publicidade direcionada por perfilamento;
  - a Resolução 163 do Conanda considera abusiva a comunicação mercadológica dirigida à criança (até 12 anos);
  - por isso, a oferta do Premium não aparece para menores de 12. Ela vai para o responsável. A API devolve `offersAllowed` em `/me`.
- **Secretaria:** `GET companies/:tenant/network` (administrador da secretaria ou MASTER) mostra cada escola com alunos, professores, ativos na semana e progresso médio nas tarefas. É somente leitura.

## Alternativas descartadas
- **Módulo "escola" separado da empresa:** duplicaria pessoas, cotas, convites, relatórios e isolamento. A escola é o mesmo problema com outros nomes.
- **Turma como departamento comum, sem `kind`:** a virada de ano e a liberação por série precisam saber o que é série e o que é turma.
- **Professor como administrador com restrição:** misturaria a cota de administradores e exigiria exceções em todo o painel da empresa.
- **Login criado pela escola (sem e-mail):** em aberto, o cliente vai conversar com o Kewen. Por enquanto, e-mail para todos.

## Consequências
- O painel da empresa continua igual para empresas. Para escolas, a web precisa de telas próprias: turmas por série, professores e suas matérias, virada de ano e transferência (administrador); minhas turmas, tarefas, cobrança e relatório (professor); filhos (responsável); visão da rede (secretaria).
- `areaFor` ganha o perfil `PROFESSOR`. Até a tela existir, o professor cai na área de estudo.
- O relatório do professor vem pronto da API em JSON e em CSV.

## Pendências
- Telas web e app (lista acima).
- Ligar o `PushSender` (FCM/Expo) para a cobrança chegar como notificação. Hoje vai como aviso no app e e-mail.
- Login de aluno sem e-mail (decisão do cliente com o Kewen).
- Revisão jurídica: termo de consentimento do responsável, política de privacidade e contrato com a escola.
- Rodar a migração e os testes e2e (`backend/test/e2e/escola.mjs`). Esta ADR foi escrita num ambiente sem acesso aos binários do Prisma.
