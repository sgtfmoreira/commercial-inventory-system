# BASTIDOR OS — B2.18.6C: Interface de administração de usuários e permissões

> Data: 13 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> Base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **implementação e validação local concluídas; 43/43 testes frontend, 46/46 testes backend relevantes e 265/265 testes backend completos aprovados**

## 1. Resultado executivo

A página de usuários foi reconstruída sobre os contratos reais das B2.18.2 e B2.18.6B, sem criar uma segunda arquitetura de permissões. A interface agora permite administrar usuários e seus vínculos explícitos por estabelecimento, preparar perfis e overrides em `DRAFT`, consultar preview e histórico, executar rollback autorizado para `LEGACY` e administrar autoridades em organizações que já possuam OWNER inicializado.

Foram preservados:

- modo efetivo `LEGACY`;
- kill switch e ausência de ativação `PROFILED` nesta etapa;
- autenticação, navegação e layout existentes;
- vínculos fora do alcance administrativo do ator;
- ausência de concessão automática para todas as unidades;
- bloqueio do bootstrap do primeiro OWNER.

Resultados:

- testes de interação da nova página: **9/9 aprovados**;
- suíte frontend completa: **43/43 aprovados**;
- build de produção: **compilado com sucesso**;
- testes backend relevantes: **46/46 aprovados**;
- suíte backend completa e reproduzível: **265/265 aprovados**;
- schema e 60 migrations preservados;
- staging vazio e working tree original sem edição ou staging.

Com autorização complementar, o snapshot backend foi atualizado sem reduzir cobertura: ele continua verificando os quatro papéis LEGACY, passa a exigir `STOCK_COUNTER = Contador de estoque` e `MANAGER = Gerente`, e rejeita explicitamente o rótulo antigo.

Decisão: **GO condicionado para planejar a próxima etapa após revisão. NO-GO permanece para publicação, PROFILED, bootstrap do primeiro OWNER, banco remoto, staging ou commit.**

## 2. Gates e isolamento

| Gate | Resultado |
|---|---|
| Worktree/branch/HEAD | Confirmados |
| HEAD | `251d45bee486fc1af41e6ba2cff5ccc896dafc56` |
| Staging | Vazio |
| Schema SHA-256 | `47b44778697099f55625d02c9b98dfb3f0d3bf93ebf716787425d5ae705ce8af` |
| Migrations | 60, sem nomes duplicados |
| Autorização efetiva | `LEGACY` |
| PROFILED | Não ativado |
| Supabase/Render/Stripe | Nenhuma conexão |
| Working tree original | Branch `feat/user-permissions-migration-plan`, HEAD `288de0c86262`, zero staged |

Os testes frontend foram executados em cópia temporária fora do caminho `.tools`, reutilizando somente as dependências locais já validadas. Os diretórios temporários e o build gerado foram removidos ao final.

## 3. Allowlist e arquivos alterados

Os três caminhos frontend anunciados antes da implementação e o teste backend posteriormente autorizado foram criados ou alterados:

1. `src/pages/Users.js`;
2. `src/services/userAccessService.js`;
3. `src/pages/Users.test.js`.
4. `backend/test/legacyAuthorizationParity.test.js`.

| Arquivo | SHA-256 final |
|---|---|
| `src/pages/Users.js` | `fec0518e4af100fa511b375d9f0c5a6efe6e46f946d86bfa5ece89442740ba97` |
| `src/services/userAccessService.js` | `36355f68fd2bbb68b375f71e85d5feed2b506b019e8da65e7c05db98b87d3055` |
| `src/pages/Users.test.js` | `d18afdb3abf2d907310aff2eb8e310e2a93b648a2fbed8bba081b8d60b52dd55` |
| `backend/test/legacyAuthorizationParity.test.js` | `4ee566621470a92140bb1662dfc3df9f170937fc31fd96c61dfd9b3a8f71a893` |

Nenhum arquivo backend funcional, componente global, schema, migration, package ou infraestrutura foi modificado na B2.18.6C.

## 4. Listagem e administração de usuários

A tela oferece:

- nome, e-mail, identificador, estado ativo/inativo e unidades visíveis;
- papel LEGACY, modo efetivo e configurações `DRAFT`/`ACTIVE` por unidade;
- busca por nome/e-mail e filtro por estado;
- estados de loading, vazio e falha;
- contador `Ativos visíveis / limite`, com bloqueio visual ao atingir 10;
- rótulo corrigido `STOCK_COUNTER = Contador de estoque`;
- desativação com confirmação e proteção contra autodesativação.

O backend continua sendo a autoridade para o limite organizacional real de dez pessoas. Como `/api/users` devolve apenas usuários alcançáveis pelas unidades administráveis do ator, a UI identifica explicitamente o contador como **visível** e não afirma conhecer pessoas de unidades fora desse alcance.

## 5. Cadastro e edição por estabelecimento

O formulário não pré-seleciona unidades. Cada estabelecimento administrável precisa ser escolhido explicitamente e recebe:

- papel LEGACY próprio;
- perfil B2 próprio;
- lista opcional de overrides `ALLOW`/`DENY`;
- justificativa individual quando informada.

Regras preservadas:

- somente unidades em que a sessão possui vínculo `ADMIN` são oferecidas;
- unidades não administráveis não entram no payload;
- o backend preserva vínculos fora do alcance do ator;
- remoções de unidades selecionáveis exigem confirmação explícita;
- nenhuma unidade futura ou não selecionada é concedida;
- OWNER não aparece entre os perfis atribuíveis pelo cadastro comum;
- erros de limite, autorização, validação e conflito mantêm a mensagem de domínio fornecida pela API.

Os perfis exibidos são:

```text
OWNER
ADMINISTRATOR
MANAGER
SUPERVISOR
COLLABORATOR
AUDITOR / Consultor
```

OWNER é apresentado somente no fluxo separado de autoridade. Não foi criado perfil CONSULTANT.

## 6. DRAFT, preview, histórico e rollback

A configuração detalhada é escopada ao estabelecimento ativo e integra:

- leitura da configuração atual;
- seleção de perfil;
- overrides delegáveis;
- gravação de `DRAFT` com optimistic locking;
- preview das permissões mantidas, concedidas, removidas e ainda negadas;
- histórico de eventos de auditoria;
- rollback confirmado para `LEGACY` quando o acesso já estiver `PROFILED`.

A ação `Ativar PROFILED` é exibida deliberadamente desabilitada. O backend não fornece à interface um contrato de leitura das flags e do kill switch, e a autorização da B2.18.6C proíbe a ativação. Portanto, nenhuma chamada direta ao endpoint de ativação pode ser emitida pela tela nesta etapa.

## 7. Autoridade OWNER

A interface consulta e administra autoridades apenas para uma sessão que já seja OWNER explícito e ativo. Estão conectados os contratos de:

- listar autoridades;
- designar outro OWNER;
- revogar uma autoridade que não seja o próprio ator;
- transferir propriedade;
- selecionar método de verificação e registrar motivo quando exigido.

Se o backend responder `Autoridade organizacional insuficiente`, inclusive após o interceptor HTTP converter o 403 em `Error`, a tela mostra orientação para a cerimônia administrativa externa. Não existe botão, endpoint alternativo ou chamada de bootstrap do primeiro OWNER.

As proteções de último OWNER, autoelevação, cross-tenant e auditoria continuam no backend B2.18.6B.

## 8. Endpoints utilizados

### Usuários

```text
GET    /api/users
POST   /api/users
PUT    /api/users/:id
DELETE /api/users/:id
```

### Configuração de acesso

```text
GET    /api/user-access/profiles
GET    /api/user-access/permissions
GET    /api/user-access/users/:userId
PUT    /api/user-access/users/:userId/draft
GET    /api/user-access/users/:userId/preview
GET    /api/user-access/users/:userId/history
POST   /api/user-access/users/:userId/rollback
```

O cliente possui o método correspondente a `POST /activate`, mas a UI não o chama enquanto PROFILED estiver fora do escopo.

### Autoridade organizacional

```text
GET    /api/user-access/owners
POST   /api/user-access/owners/:userId
DELETE /api/user-access/owners/:userId
POST   /api/user-access/owners/:userId/transfer
```

## 9. Testes frontend

### Interação da página

`src/pages/Users.test.js` executou **9/9 casos aprovados**:

1. listagem, busca e nomenclatura de `STOCK_COUNTER`;
2. cadastro em uma unidade sem concessões automáticas;
3. cadastro em múltiplas unidades com perfis diferentes;
4. edição sem expor ou remover vínculo não administrável;
5. limite visual de dez pessoas;
6. mensagem de falha de autorização;
7. coexistência de `LEGACY`, `DRAFT` e perfil por unidade;
8. DRAFT, preview, histórico, bloqueio de activate e rollback;
9. proteção de OWNER e orientação para a cerimônia inicial.

Os testes renderizam o componente em jsdom e disparam interações reais de inputs, selects, checkboxes, botões, confirmação e chamadas de serviço. Não são apenas snapshots estáticos.

### Suíte frontend completa

```text
suítes:  9/9 aprovadas
testes:  43/43 aprovados
falhas:  0
```

Foram preservadas as oito suítes anteriores, que somavam 34 testes, e acrescentados os nove testes de usuários.

## 10. Build e design system

O build de produção compilou com sucesso fora de CI. Nenhum warning ESLint foi atribuído aos três arquivos da B2.18.6C.

O build com `CI=true` permanece bloqueado por warnings preexistentes em outras páginas (`Entries`, `EventDetail`, `MarketingEvents`, `Patrimony`, `Production`, `Products`, `PurchaseOrders`, `PurchaseSuggestions`, `StockAuditDetail`, `StockLocations` e `StockTransfers`). Esses arquivos estão fora desta allowlist.

O verificador de componentes identificou inicialmente um checkbox nativo na nova página. Ele foi substituído por `CheckboxControl`, do design system. Na verificação final, a única inconsistência restante foi uma `<table>` nativa preexistente em `TableReservations.js`, também fora desta etapa.

Os testes emitem um warning preexistente de `Modal.js`: a prop `maxWidth` é encaminhada ao elemento DOM. A correção exige alterar o componente global e não foi realizada sem autorização.

## 11. Testes backend relevantes

Foram executados:

```text
userService.test.js
userController.test.js
organizationAuthority.test.js
userAccessConfiguration.test.js
organizationBillingFlow.test.js
legacyAuthorizationParity.test.js
```

Resultado:

```text
testes:     46
aprovados:  46
falhas:      0
```

O snapshot anterior exigia:

```text
STOCK_COUNTER -> Gerente
```

e declarava no nome do caso que registrava “a divergência da UI”. A expectativa autorizada foi corrigida para:

```text
STOCK_COUNTER -> Contador de estoque
MANAGER       -> Gerente
```

O teste mantém as verificações dos quatro papéis aceitos, de `STAFF` e da paridade LEGACY. Também assegura que `STOCK_COUNTER` não volte a receber o rótulo “Gerente”.

### Suíte backend completa

A primeira execução usando as dependências compartilhadas obteve 264/265 porque aquele diretório contém Zod 4.6.7, enquanto o lockfile do worktree fixa Zod 3.25.76. Nenhum teste foi alterado para contornar a diferença.

Foi então criada uma instalação temporária com `npm ci --ignore-scripts`, usando exclusivamente o registry oficial e as versões do lockfile. O Prisma Client 5.22.0 foi gerado com os engines locais previamente verificados e datasource inválido em `127.0.0.1:1`.

Resultado reproduzível final:

```text
arquivos:    59
testes:     265
aprovados:  265
falhas:       0
cancelados:   0
ignorados:    0
Zod:          3.25.76
Prisma:       5.22.0
```

Uma tentativa intermediária após `npm ci --ignore-scripts` confirmou que o client Prisma ainda não havia sido gerado; seus casos não constituem falhas funcionais. Após `prisma generate`, a mesma cópia passou integralmente. Nenhuma conexão de banco foi aberta.

## 12. Integridade final

| Verificação | Resultado |
|---|---|
| Testes frontend | 43/43 aprovados |
| Build de produção | Compilado com warnings preexistentes fora do escopo |
| Testes backend relevantes | 46/46 aprovados |
| Suíte backend completa | 265/265 aprovados com dependências do lockfile |
| `git diff --check` | Aprovado |
| Schema SHA-256 | Preservado |
| Migrations | 60, sem duplicatas |
| Staging | Vazio |
| LEGACY | Preservado como padrão |
| PROFILED | Não ativado |
| Bootstrap OWNER | Não executado nem exposto |
| Serviços/bancos remotos | Não acessados |
| Migration/seed/replay | Não executados |
| Commit/push/deploy | Não executados |
| Diretórios temporários | Removidos |

## 13. Pendências e riscos

| Criticidade | Item | Gate |
|---|---|---|
| Alta | Primeiro OWNER continua sem cerimônia administrativa | Definir processo externo autenticado e auditável |
| Alta | PROFILED permanece deliberadamente desativado | Fase própria após gates remotos e operacionais |
| Alta | B2.14 e rotação da credencial PostgreSQL continuam pendentes | Resolver antes de qualquer operação remota |
| Média | Contagem organizacional completa não é exposta ao administrador parcial | Backend aplica o limite real; UI mostra somente ativos visíveis |
| Média | `Modal.maxWidth` produz warning React | Correção global fora da allowlist |
| Média | CI e checker de UI têm débitos preexistentes fora da página de usuários | Tratar em etapa de qualidade separada |
| Média | Oito precisões decimais e default de billing permanecem | Decisão separada, sem correção por inferência |

## 14. GO/NO-GO

### GO condicionado

- aceitar funcionalmente a interface local da B2.18.6C;
- aceitar os 43 testes frontend e o build compilado como evidência da implementação;
- aceitar os 46 testes backend relevantes e os 265 testes backend completos com zero falhas;
- considerar encerrada a pendência de nomenclatura LEGACY;
- planejar a próxima etapa somente mediante nova autorização e allowlist própria.

### NO-GO atual

- avançar automaticamente para outra fase;
- ativar PROFILED;
- executar bootstrap do primeiro OWNER;
- staging, commit, push, deploy ou publicação;
- conexão com Supabase, Render, Stripe ou banco remoto;
- migration, seed, replay ou script operacional;
- corrigir componentes globais ou débitos de outras páginas fora da allowlist.

B2.18.6C implementada e validada no limite autorizado. Execução encerrada sem iniciar outra fase.
