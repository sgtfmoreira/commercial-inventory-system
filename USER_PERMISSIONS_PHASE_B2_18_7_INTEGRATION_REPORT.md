# BASTIDOR OS — B2.18.7: Validação integrada e preparação operacional

> Data: 13 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> Base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **validação local concluída; concorrência PostgreSQL real aprovada; publicação e primeiro OWNER permanecem bloqueados**

## 1. Resultado executivo

A integração de usuários e permissões foi validada contra PostgreSQL 16.14 real, novo e exclusivamente local. As 60 migrations foram aplicadas em ordem e o Prisma informou que o banco estava atualizado.

Os ensaios concorrentes usaram os serviços reais de produção, o Prisma Client 5.22.0 gerado e transações PostgreSQL `Serializable`, sem mocks de banco:

- dois cadastros simultâneos iniciados com nove pessoas ativas terminaram com uma criação e uma rejeição; total final: dez;
- duas reativações simultâneas iniciadas com nove pessoas ativas terminaram com uma reativação e uma rejeição; total final: dez;
- duas revogações OWNER concorrentes terminaram com uma revogação e um OWNER ativo;
- duas transferências concorrentes pelo mesmo OWNER terminaram com uma transferência, um OWNER ativo e um único evento de transferência.

Também foram aprovados acesso explícito em duas unidades com papéis e perfis diferentes, preservação de vínculo fora do alcance do administrador, desativação autorizada, bloqueios cross-tenant, DRAFT, preview, histórico, rollback para `LEGACY` e imutabilidade da auditoria.

Resultados automatizados:

- backend: **265/265 testes aprovados**;
- frontend: **43/43 testes aprovados**;
- migrations aplicadas: **60/60**;
- acessos `PROFILED` no ensaio: **zero**.

Decisão: **GO condicionado para uma etapa separada de desenho/aprovação da cerimônia do primeiro OWNER e demais gates operacionais. NO-GO para publicação, ativação PROFILED, bootstrap, banco remoto, staging ou commit.**

## 2. Allowlist e alterações

Antes da execução foi anunciada a allowlist persistente exata:

```text
USER_PERMISSIONS_PHASE_B2_18_7_INTEGRATION_REPORT.md
```

Nenhum arquivo funcional, teste, schema, migration, package ou lockfile foi alterado. Dois harnesses temporários foram criados somente dentro do diretório descartável, executados e removidos junto com todo o ambiente.

## 3. Ambiente PostgreSQL descartável

```text
PostgreSQL: 16.14
host:       127.0.0.1
port:       55439
database:   bastidor_b2187
role:       bastidor_b2187_admin
auth:       local descartável
```

A identidade foi consultada diretamente no servidor antes dos testes. Não foram usados senha, túnel, proxy, hostname ou credencial de ambiente remoto.

O backend foi copiado para workspace temporário e instalado pelo lockfile com lifecycle desativado:

```text
npm ci --ignore-scripts
pacotes backend: 171
Prisma/Client:   5.22.0
Zod:             3.25.76
Stripe:          23.0.1 (não inicializado nem acessado)
```

O Prisma Client foi gerado com engines locais 5.22.0 previamente verificados. O replay usou somente `prisma migrate deploy` contra a URL local explícita. Não foram executados seed, `migrate resolve`, `db push`, script de reparação ou build com efeito em banco.

Resultado estrutural final antes do descarte:

```text
migrations finalizadas: 60
migrations incompletas:  0
migrations revertidas:   0
acessos PROFILED:         0
eventos sintéticos:      10
```

Ao final, o PostgreSQL foi encerrado, a porta `55439` ficou sem listener e `C:\Users\Moreira\AppData\Local\Temp\bastidor-b2187` foi removido integralmente.

## 4. Concorrência real do limite de usuários

### Cadastro simultâneo

Preparação:

```text
organização sintética
1 ADMIN ativo
8 usuários adicionais ativos
total inicial: 9 pessoas distintas
```

Duas chamadas reais de `userService.create` foram disparadas simultaneamente, com e-mails e usuários diferentes.

```text
transações concluídas: 1
transações rejeitadas: 1
rejeição final:         HTTP lógico 409 — limite de 10 usuários ativos
total final:            10
```

O PostgreSQL abortou o conflito serializável; o retry do serviço reavaliou a capacidade no novo estado e bloqueou a segunda criação.

### Reativação simultânea

Outra organização foi preparada com nove pessoas ativas e duas pessoas inativas. Duas chamadas reais de `userService.update` tentaram reativá-las simultaneamente.

```text
reativações concluídas: 1
reativações rejeitadas: 1
rejeição final:          HTTP lógico 409 — limite de 10 usuários ativos
total final:             10
```

Assim, o limite conta pessoas distintas, não vínculos, e permaneceu respeitado em criação e reativação concorrentes.

## 5. Concorrência e proteção OWNER

### Revogação concorrente

Com dois OWNERs ativos, cada um tentou revogar o outro simultaneamente.

```text
revogações concluídas: 1
revogações rejeitadas: 1
rejeição após retry:    403 — autoridade organizacional insuficiente
OWNERs ativos finais:  1
```

A transação perdedora foi reexecutada após o conflito e encontrou seu ator já revogado. O sistema falhou fechado e não removeu o último OWNER.

### Transferência concorrente

Um OWNER tentou transferir simultaneamente para dois destinos diferentes.

```text
transferências concluídas: 1
transferências rejeitadas: 1
rejeição após retry:       403 — autoridade organizacional insuficiente
OWNERs ativos finais:      1
eventos de transferência:  1
```

Também foram confirmados em PostgreSQL real:

- bloqueio de autorrevogação;
- rejeição de designação para usuário de outra organização;
- alvo obrigatório com vínculo ativo na organização;
- auditoria na mesma transação da alteração de autoridade.

Nenhum primeiro OWNER foi criado pelos serviços. As autoridades iniciais usadas nesses testes foram fixtures sintéticas inseridas diretamente no banco descartável para exercitar operações de organizações já inicializadas; isso não constitui bootstrap operacional.

## 6. Fluxos integrados validados

### Cadastro e acessos explícitos

Um usuário foi criado pelos serviços reais com dois vínculos selecionados explicitamente:

| Unidade | Papel LEGACY | Perfil DRAFT | Modo efetivo |
|---|---|---|---|
| A | `MANAGER` | `MANAGER` | `LEGACY` |
| B | `STOCK_COUNTER` | `AUDITOR` | `LEGACY` |

Nenhuma terceira unidade ou unidade futura foi concedida. A contagem organizacional considerou a pessoa apenas uma vez.

### Edição e desativação

- a edição alterou o papel da unidade administrável para `STOCK_COUNTER`;
- um vínculo `MANAGER` em unidade fora do alcance do ator permaneceu ativo e inalterado;
- a tentativa de desativar todos os vínculos sem administrar uma das unidades foi rejeitada;
- a desativação de usuário limitado à unidade administrável revogou exatamente um vínculo.

### Configuração de acesso

Foram exercitados sobre dados reais:

- leitura da configuração;
- DRAFT criado em `LEGACY`;
- preview do perfil `MANAGER`;
- histórico de auditoria;
- rollback confirmado, permanecendo em `LEGACY`;
- optimistic version presente no contrato.

`activate` não foi chamado. Nenhuma linha `UserEstablishmentAccess` terminou em `PROFILED`.

### Contratos frontend/backend

Os caminhos consumidos por `src/services/userAccessService.js` foram reconciliados com `userRoutes.js` e `userAccessRoutes.js`: CRUD de usuários, catálogo, acesso, DRAFT, preview, histórico, rollback e autoridades OWNER permanecem alinhados. A suíte backend validou o inventário de 185 rotas internas; a suíte frontend exercitou os clientes e nove interações da página de usuários.

## 7. Evidências multi-tenant e auditoria

- cadastro com estabelecimento de outra organização foi rejeitado antes de criar o usuário;
- leitura de acesso de usuário cross-tenant retornou não encontrado;
- listagem do administrador não expôs usuários da organização vizinha;
- designação OWNER cross-tenant foi rejeitada;
- edição preservou vínculo de unidade não administrável;
- tentativa de `UPDATE` em `security_audit_events` foi rejeitada pelo trigger append-only.

Essas verificações foram feitas no PostgreSQL local real, não apenas por doubles.

## 8. Suítes automatizadas

### Backend

Os 59 arquivos de teste foram executados com as versões do lockfile, banco local e flags seguras:

```text
arquivos:    59
testes:     265
aprovados:  265
falhas:       0
cancelados:   0
ignorados:    0
```

### Frontend

Como o Jest ignora projetos sob `.tools`, os fontes foram copiados para diretório temporário fora desse caminho e executados com as dependências locais já validadas, sem instalação ou rede:

```text
suítes:      9/9
testes:     43/43
falhas:       0
```

Permanece o warning conhecido de `Modal.maxWidth`, fora da allowlist e sem impacto nos resultados.

## 9. Proposta de cerimônia para o primeiro OWNER

Nenhum endpoint público deve ser criado. A proposta é uma operação administrativa separada, de uso único por organização, executada por ferramenta interna/CLI fora do tráfego normal da aplicação.

### Pré-condições

1. solicitação nominal vinculada a ticket imutável;
2. organização identificada por UUID, nome e confirmação de ambiente;
3. candidato identificado por UUID e e-mail, com vínculo `ADMIN` ativo na organização;
4. autenticação corporativa do solicitante e do operador com MFA;
5. aprovação por duas pessoas distintas (`maker-checker`);
6. confirmação digitada contendo ambiente, organização e usuário;
7. prova de que a organização possui zero OWNERs ativos e zero operação pendente.

### Execução proposta

1. modo `dry-run` obrigatório apresenta somente IDs, sem segredos;
2. credencial administrativa curta, exclusiva da execução e limitada ao banco/alvo;
3. transação `Serializable` com advisory lock derivado do UUID da organização;
4. nova verificação de zero OWNER ativo dentro do lock;
5. criação de exatamente uma `OrganizationAuthority(OWNER)`;
6. criação, na mesma transação, de evento append-only `ORGANIZATION_FIRST_OWNER_BOOTSTRAPPED`;
7. metadados: ticket, request ID, solicitante, operador, aprovador, hashes das confirmações, ambiente e timestamp;
8. resposta sem dados sensíveis e encerramento imediato da credencial.

### Idempotência e duplicidade

Sob o lock organizacional:

- repetição do mesmo request ID e mesmo alvo retorna o resultado existente;
- request diferente após OWNER existir falha fechado;
- concorrência entre alvos diferentes permite somente o primeiro commit;
- qualquer falha de auditoria reverte a autoridade.

### Decisão de modelagem pendente

O schema atual exige `actorUserId` de um usuário da aplicação e não modela nominalmente operadores administrativos externos nem uma chave única de bootstrap. Antes de implementar, deve-se escolher e aprovar uma destas opções:

1. registrar como ator o ADMIN solicitante/candidato e guardar operador/aprovador externos nos metadados, com request ID verificado sob advisory lock; ou
2. criar um modelo próprio de operação administrativa com request ID único e identidades externas — opção mais forte, mas que exige schema e migration novos.

A recomendação é a segunda opção para rastreabilidade e idempotência formal. Nenhuma das opções foi implementada nesta etapa.

## 10. Segurança e integridade final

| Verificação | Resultado |
|---|---|
| Schema SHA-256 | `47b44778697099f55625d02c9b98dfb3f0d3bf93ebf716787425d5ae705ce8af` |
| Migrations no worktree | 60, sem nomes duplicados |
| `git diff --check` | Aprovado |
| Staging no worktree isolado | Vazio |
| Branch/HEAD do original | `feat/user-permissions-migration-plan` / `288de0c86262bb4a1602a418bf5b36060cbe3ddf` |
| Staging no original | Vazio |
| LEGACY | Preservado |
| PROFILED | Zero ativações |
| PostgreSQL temporário | Encerrado e removido |
| Supabase/Render/Stripe | Não acessados |
| Seed/reparação | Não executados |
| Commit/push/deploy | Não executados |

## 11. Riscos e pendências para publicação

| Criticidade | Item | Gate |
|---|---|---|
| Crítica | Primeiro OWNER sem cerimônia aprovada | Aprovar identidade administrativa, auditoria e idempotência antes de implementar |
| Crítica | Credencial PostgreSQL anteriormente exposta | Rotacionar antes de qualquer operação remota |
| Alta | B2.14 read-only ainda pendente | Confirmar história e checksums reais do Supabase |
| Alta | PROFILED deliberadamente desativado | Ativação exige fase, observabilidade e rollback próprios |
| Alta | Cerimônia recomendada exige decisão de schema/migration | Autorizar desenho e implementação separadamente |
| Média | Contagem completa não é exposta ao administrador parcial | Backend aplica o limite; UI informa somente ativos visíveis |
| Média | Warning `Modal.maxWidth` permanece | Correção global fora deste escopo |
| Média | Oito precisões decimais e default de billing permanecem | Decisão separada, sem correção por inferência |

## 12. GO/NO-GO

### GO condicionado

- aceitar a evidência PostgreSQL real do limite de dez, reativação e operações OWNER concorrentes;
- aceitar os fluxos integrados e o isolamento multi-tenant;
- aceitar os resultados 265/265 backend e 43/43 frontend;
- submeter a cerimônia do primeiro OWNER a revisão de segurança e modelagem;
- planejar a próxima etapa somente com autorização e allowlist próprias.

### NO-GO

- publicar ou ativar PROFILED;
- executar bootstrap do primeiro OWNER;
- conectar a Supabase, Render, Stripe ou banco remoto;
- usar a credencial anteriormente exposta;
- staging, commit, push, deploy ou publicação;
- migration, seed, replay adicional ou script operacional;
- iniciar automaticamente outra fase.

B2.18.7 concluída no limite autorizado. Nenhuma publicação ou ativação foi iniciada.
