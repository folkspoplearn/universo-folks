# Perfis e permissões

> tags: perfis, permissões, rbac, master, admin, colaborador, aluno, contexto, escola, professor, responsável, secretaria | fontes: arquitetura.md, decisões do cliente

## Os quatro perfis
| Perfil | Escopo |
|---|---|
| **MASTER-FOLKS** | Acesso total à plataforma: clientes, conteúdo, financeiro de todos, configurações gerais e parametrização de cada empresa. Cria e exclui outros MASTERs, **mas não pode excluir a si mesmo**. |
| **ADMIN-CLIENTE** | Acesso total, mas **só aos dados da própria empresa**: colaboradores, departamentos, liberação de planetas por departamento, trilhas obrigatórias com prazo e prioridade, e dashboards. Não altera as cotas de licença (isso é do MASTER). |
| **COLABORADOR-CLIENTE** | Vê só os cursos e temas liberados para os departamentos dele (um ou mais). |
| **ALUNO-CLIENTE (B2C)** | Uso individual, grátis ou Premium. |

## Na escola (ADR 0020)
A escola é um tenant com `segment = SCHOOL`. Os papéis são os mesmos da empresa, mais o professor:
| Perfil | Escopo |
|---|---|
| **Administrador da escola** (`ADMIN_CLIENTE`) | Tudo da escola: contas, séries e turmas, professores e suas matérias, virada de ano, transferências, relatórios. |
| **Professor** (`PROFESSOR`) | Só as turmas e matérias do seu `TeachingAssignment`: alunos, tarefas (lição de casa ou estudo, com prazo ou em aberto), cobrança e relatório. Também estuda, como o aluno. Ocupa licença de usuário. |
| **Aluno** (`COLABORADOR_CLIENTE`) | Estuda o que foi liberado para a sua turma e recebe tarefas e avisos. |
| **Responsável** (`GuardianLink`, sem papel na escola) | Dá o consentimento e acompanha cada filho ligado. Vale para aluno de escola e para criança avulsa. |
| **Administrador da secretaria** (`ADMIN_CLIENTE` num tenant `SCHOOL_NETWORK`) | Visão somente leitura de todas as escolas da rede. |

## Contexto ativo (modo)
Um mesmo usuário pode ter vários papéis. O **contexto ativo** vai no token:
- `PLATFORM`: atuando como MASTER.
- `TENANT`: dentro da empresa, como ADMIN ou COLABORADOR.
- `B2C`: modo individual (todo usuário tem).

**Um colaborador também pode ser B2C:** ele paga o uso individual e alterna entre o modo B2B e o B2C com o mesmo usuário (`switch-context`).

## Regras de vínculo
- **Uma pessoa só pode estar em UMA empresa** (convidada ou ativa). Decisão do cliente; ver ADR 0003.
- Remover alguém da empresa apaga só o vínculo. A conta continua no modo B2C.
- **Mudança de escola:** a nova escola pede a transferência e o aluno aceita pelo código recebido por e-mail. O vínculo antigo é desativado e o histórico continua com o aluno (ADR 0020).
- A empresa sempre mantém **pelo menos 1 ADMIN ativo**.
- Vínculo desativado (`DISABLED`) libera a pessoa para entrar em outra empresa.
- "Ver como" (MASTER): token de 30 minutos, **somente leitura**, simulando o ADMIN ou um colaborador de uma empresa.
