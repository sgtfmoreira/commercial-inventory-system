# BASTIDOR OS — B2.18.5: Validação integrada e auditoria de usuários

> Data: 11 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> Base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **validação concluída; replay local aprovado, publicação bloqueada por lacunas funcionais e de runtime**

## 1. Resultado executivo

As 60 migrations foram aplicadas, em ordem, em PostgreSQL 16.14 novo e exclusivamente local. O histórico terminou com 60 migrations aplicadas, zero incompletas, zero rollback e zero checksum malformado. `prisma migrate status` informou que o schema estava atualizado.

Testes com dados sintéticos confirmaram no PostgreSQL real:

- uma configuração `ACTIVE` e uma `DRAFT` por acesso;
- unicidade de overrides;
- FKs e isolamento entre organizações/estabelecimentos;
- auditoria append-only;
- unicidade de reserva–ocupação e de mesa ativa;
- criação de usuário em duas unidades, login, rascunho AUDITOR, auditoria, bloqueio de autoelevação e de acesso cross-tenant;
- entrada/saída de estoque com saldos local/global consistentes;
- transferência com conversão, bloqueio cross-organization e aprovação idempotente.

O modo `PROFILED` não foi ativado. O fluxo sintético de permissões permaneceu em `LEGACY` e gerou somente um rascunho.

A suíte backend ampla obteve **255/257 aprovações**. As duas falhas identificam problemas reproduzíveis do ambiente/harness, não falhas nas 255 regras aprovadas: um mock desatualizado do middleware e uma instalação local de Zod 4.6.7 divergente do manifesto/lockfile, que declaram Zod 3. A suíte frontend existente obteve **34/34 aprovações**.

A publicação continua **NO-GO**. Os bloqueios principais são:

1. a interface de Usuários continua limitada ao CRUD LEGACY e não expõe perfis B2, overrides, preview, ativação, rollback ou histórico;
2. o onboarding não cria a autoridade organizacional `OWNER`, e o serviço de autoridade não possui controller/rota operacional;
3. não existe limite de usuários implementado;
4. não existe perfil CONSULTOR; existe somente AUDITOR;
5. não há teste de interação da página `Users.js`;
6. o Prisma Client reutilizado estava desatualizado e rejeitou `reservationGroupId`; é obrigatório provar uma instalação limpa seguida de `prisma generate`;
7. o script `build` ainda executa migration e seed automaticamente;
8. permanecem oito divergências decimais e o default de `organization_subscriptions.updatedAt`.

Decisão: **GO para planejar/corrigir a B2.18.6 com allowlist explícita; NO-GO para publicação, staging, commit, deploy, banco remoto ou PROFILED.**

## 2. Gates iniciais

| Gate | Resultado |
|---|---|
| Worktree/branch/HEAD | Confirmados |
| HEAD | `251d45bee486fc1af41e6ba2cff5ccc896dafc56` |
| Schema SHA-256 | `47b44778697099f55625d02c9b98dfb3f0d3bf93ebf716787425d5ae705ce8af` |
| Migrations | 60, sem nomes duplicados |
| Staging | Vazio |
| Autorização padrão | `LEGACY` |
| Feature flag | `USER_PERMISSIONS_ENABLED` desativada nos testes |
| PROFILED persistido no ensaio | Zero acessos |
| Node.js local | `24.19.0` |
| npm local | `11.17.0` |
| Working tree original | Branch/HEAD preservados, 243 entradas preexistentes, zero staged |

Identidade final da origem:

```text
branch: feat/user-permissions-migration-plan
HEAD:   288de0c86262bb4a1602a418bf5b36060cbe3ddf
staged: 0
```

## 3. PostgreSQL descartável e replay

Ambiente criado exclusivamente para esta etapa:

```text
PostgreSQL: 16.14
host:       127.0.0.1
port:       55438
database:   bastidor_b2_18_5_replay
role:       bastidor_b2185_admin
```

O cluster usou autenticação local descartável, sem senha remota, túnel, proxy, dados reais ou referência ao Supabase. A identidade foi consultada diretamente no servidor antes do replay.

Foi executado somente `prisma migrate deploy` com schema e URL explicitamente locais. Não foram executados build, seed, `migrate resolve`, `db push` ou script de reparação.

Resultado:

```text
60 migrations encontradas
60 migrations aplicadas
0 incompletas
0 rollback
0 checksum malformado
prisma migrate status: database schema is up to date
```

Ao final, o servidor foi encerrado, o data directory e o log descartáveis foram removidos e a porta `55438` ficou sem listener.

## 4. Integridade estrutural

Foram confirmados no catálogo:

- cinco tabelas B2: `user_establishment_accesses`, `access_configurations`, `permission_overrides`, `organization_authorities` e `security_audit_events`;
- índices únicos parciais para uma configuração `DRAFT` e uma `ACTIVE` por acesso;
- trigger append-only de `security_audit_events`;
- índice parcial de reserva ativa por estabelecimento/mesa/data;
- índice parcial de ocupação ativa por estabelecimento/mesa;
- unicidade de `table_occupancies.reservationId`;
- FKs de check-in, autoridade, acesso, overrides e auditoria.

Um ensaio transacional, encerrado com `ROLLBACK`, comprovou as violações esperadas de unicidade/FK e a rejeição de `UPDATE` na auditoria. O estado observado antes do rollback foi:

```text
ACTIVE por acesso:       1
DRAFT por acesso:        1
ocupação por reserva:    1
evento imutável:         1
```

## 5. Drift schema versus replay

`prisma migrate diff`, somente contra o banco local, retornou exit code `2` e confirmou as divergências já conhecidas:

- oito colunas financeiras são escala 2 no replay e escala 4 no datamodel;
- `organization_subscriptions.updatedAt` possui default no SQL, mas o datamodel somente usa `@updatedAt`.

Colunas decimais reportadas:

```text
consumption_event_items.unitCost
product_suppliers.price
products.unitPrice
products.currentCost
purchase_order_items.unitPrice
stock_movements.totalCost
stock_movements.unitCost
supplier_price_history.price
```

Nenhuma divergência foi corrigida nesta etapa.

## 6. Testes PostgreSQL com dados sintéticos

### Usuários e autorização

O fluxo real executado foi:

```text
owner sintético validado
  -> cria usuário STOCK_COUNTER
  -> associa automaticamente às duas unidades da organização
  -> login retorna as duas unidades
  -> salva DRAFT AUDITOR
  -> gera security_audit_event
  -> mantém modo LEGACY
```

Resultado:

```text
memberships:             2
estabelecimentos login:  2
perfil do draft:         AUDITOR
modo final:              LEGACY
eventos de auditoria:    1
autoelevação bloqueada:  sim
cross-tenant bloqueado:  sim
PROFILED ativado:        não
```

### Estoque

Entrada de 10 unidades e consumo de 3 unidades produziram:

```text
saldo global: 7
saldo local:  7
movimentos:   2
local de outro tenant: rejeitado
saldo após rejeição: inalterado
```

### Transferências

Transferência de 2 unidades entre duas unidades da mesma organização:

```text
status:                     APPROVED
origem:                     7 -> 5
destino:                    0 -> 2
quantidade convertida:      2
outra organização:          rejeitada
segunda aprovação:          rejeitada
```

### Reservas e check-in

As constraints reais foram aprovadas por SQL sintético. A tentativa de executar o service reconciliado revelou um gate de runtime anterior à query: o Prisma Client reutilizado não continha `reservationGroupId` e rejeitou a criação batch.

Isso não é divergência do banco nem do schema; é artefato gerado desatualizado. A prova de concorrência real pelo service fica pendente até instalação limpa e `prisma generate` autorizados. Os testes unitários/mocks de B2.18.4B continuam aprovados, mas não substituem esse gate.

## 7. Suítes automatizadas

### Backend completo

```text
arquivos: 59
testes:   257
pass:     255
fail:     2
```

Falhas:

1. `authMiddlewareActiveMembership.test.js` ainda mocka `findUnique`, enquanto o middleware reconciliado consulta primeiro `findFirst`; o mock deixa escapar uma chamada ao client e transforma a resposta esperada 403 em 401.
2. `productSalePriceValidation.test.js` usa um UUID aceito pelo Zod 3 do lockfile, mas a dependência reutilizada no workspace original é Zod 4.6.7 e aplica validação RFC mais estrita.

O lockfile declara Zod `3.25.76`; portanto a segunda falha deve ser reavaliada após `npm ci` limpo, sem alterar o teste por conveniência.

Entre as 255 aprovações estão autorização LEGACY/B2, autoridade organizacional, configuração de acesso, billing com Stripe mockado, estoque, transferência, reservas, check-in, métricas, multi-tenant e CRUD de usuário.

### Frontend

Os oito arquivos de teste existentes foram executados por Jest/CRA com configuração em memória e dependências locais, sem instalação ou rede:

```text
suítes: 8/8 aprovadas
testes: 34/34 aprovados
```

Foram cobertos App, Sidebar, eventos, estoque, reservas, contexto, tema e utilitários. Não existe teste para `Users.js`.

## 8. Estado real do fluxo de usuários

### Backend disponível

O backend possui:

- CRUD LEGACY `/api/users`;
- catálogo de permissões e seis perfis B2;
- leitura de acesso, preview, histórico, draft, activate e rollback em `/api/user-access`;
- optimistic locking;
- proteção contra autoelevação;
- proteção de OWNER por autoridade organizacional explícita;
- overrides `ALLOW`/`DENY`, justificativa para concessões sensíveis/financeiras e capacidades indelegáveis;
- auditoria append-only;
- rollback para LEGACY;
- isolamento por organização e estabelecimento.

### Frontend disponível

`src/pages/Users.js` oferece somente:

- listar usuários do estabelecimento;
- criar usuário com role LEGACY;
- editar nome, e-mail, senha e role LEGACY;
- desativar o acesso do usuário na organização.

A página não consome nenhum endpoint `/user-access` e não oferece:

- seleção dos perfis OWNER, ADMINISTRATOR, MANAGER, SUPERVISOR, COLLABORATOR e AUDITOR;
- catálogo ou personalização de permissões;
- preview das diferenças;
- confirmação/ativação controlada;
- rollback;
- histórico de auditoria;
- visualização clara de LEGACY versus PROFILED;
- gestão de autoridade organizacional;
- teste de interação.

Há ainda uma inconsistência visual: a opção `STOCK_COUNTER` é apresentada como “Gerente” no formulário, embora a tabela a rotule como “Contador de estoque”.

### Lacunas de domínio

- O cadastro inicial cria `ADMIN`, mas não cria `organization_authorities` do tipo OWNER.
- `organizationAuthorityService` não está exposto por controller/rota; não há bootstrap operacional do primeiro OWNER.
- Não existe limite de usuários ou integração desse limite com a assinatura.
- Não existe perfil `CONSULTANT`; o perfil de menor autoridade é `AUDITOR`, read-only e sem finanças/sensíveis por padrão.
- O CRUD cria vínculos em todas as unidades da organização, mas a UI não permite escolher subconjunto ou papéis diferentes por unidade.

Consequência: o fluxo solicitado “Proprietário → usuário → unidade → perfil → permissões → login → acesso” está implementado em partes no backend, mas **não está completo de ponta a ponta**.

## 9. Runtime, dependências e publicação

| Item | Estado |
|---|---|
| Node local | 24.19.0, compatível com Stripe 23 |
| Frontend engine | `24.x` |
| Backend engine | `>=18.0.0`, incompatível como piso com Stripe 23 (`>=20`) |
| Prisma CLI/Client | 5.22.0 |
| Stripe | 23.0.1 |
| Zod manifest/lock | `^3.22.4` / `3.25.76` |
| Lockfile | `npm ls --package-lock-only --ignore-scripts --all` aprovado |
| Start | `node src/server.js`; não migra |
| Postinstall | `prisma generate`; não acessa banco |
| Build | `prisma generate && prisma migrate deploy && prisma db seed`; altera banco |

O Build Command informado do Render continua seguro por usar `npm install && npx prisma generate`, mas o script `npm run build` permanece perigoso para qualquer pipeline futuro.

Variáveis identificadas, sem inspecionar valores:

```text
DATABASE_URL
JWT_SECRET
PORT
NODE_ENV
USER_PERMISSIONS_ENABLED
USER_PERMISSIONS_KILL_SWITCH
STRIPE_RESTRICTED_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_BASE_PRICE_ID
STRIPE_ADDITIONAL_ESTABLISHMENT_PRICE_ID
BILLING_SUCCESS_URL
BILLING_CANCEL_URL
BILLING_PORTAL_RETURN_URL
REACT_APP_API_URL
```

## 10. Riscos e pendências para publicação

| Criticidade | Risco | Gate |
|---|---|---|
| Crítica | Credencial PostgreSQL anteriormente exposta | Rotacionar e atualizar Render antes de acesso remoto |
| Crítica | Interface B2 de usuários inexistente | Implementar e testar antes de ativar PROFILED |
| Alta | Primeiro OWNER não é criado/exposto operacionalmente | Definir bootstrap seguro e auditado |
| Alta | Prisma Client desatualizado no ambiente de validação | Instalação limpa + generate + nova integração real |
| Alta | Build executa migration e seed | Separar build de operações de banco |
| Alta | B2.14 read-only pendente | Confirmar checksums/estado real do Supabase |
| Alta | Duas falhas na suíte ampla | Corrigir harness e repetir em dependências limpas |
| Alta | Oito precisões e default billing divergentes | Decisão explícita; não corrigir por inferência |
| Alta | Limite de usuários ausente | Definir regra comercial e enforcement transacional |
| Média | Perfil CONSULTOR ausente | Decidir se AUDITOR atende ou criar requisito distinto |
| Média | Roles diferentes por unidade não são gerenciáveis na UI | Definir experiência multiestabelecimento |
| Média | Nenhum teste de Users | Criar teste completo de interação |
| Média | Backend declara Node >=18, Stripe exige >=20 | Elevar engine após confirmação do Render |

## 11. Plano B2.18.6 e allowlist proposta

A B2.18.6 deve ser uma fase de correção local separada. Allowlist inicial proposta:

### Usuários e permissões frontend

```text
src/pages/Users.js
src/pages/Users.test.js                         (novo)
src/services/userAccessService.js               (novo)
```

Se a experiência for dividida em componentes, cada novo caminho deve ser aprovado nominalmente antes da edição.

### Bootstrap e ciclo de OWNER

```text
backend/src/services/authService.js
backend/src/services/organizationAuthorityService.js
backend/src/controllers/organizationAuthorityController.js   (novo)
backend/src/routes/organizationAuthorityRoutes.js             (novo)
backend/src/validations/organizationAuthorityValidation.js    (novo)
backend/src/app.js
backend/test/organizationAuthority.test.js
backend/test/organizationAuthorityFlow.test.js                (novo)
```

Antes de implementar, decidir se o primeiro usuário recebe OWNER no cadastro ou por cerimônia administrativa separada.

### Usuários, limite e testes

```text
backend/src/services/userService.js
backend/src/controllers/userController.js
backend/test/userService.test.js
backend/test/authMiddlewareActiveMembership.test.js
backend/test/userAccessConfiguration.test.js
```

O limite de usuários exige primeiro uma regra aprovada: por organização, plano, usuários ativos e tratamento de múltiplas unidades. Não codificar um número arbitrário.

### Runtime e pipeline

```text
backend/package.json
backend/package-lock.json
```

Objetivos: Node >=20, build sem migration/seed e instalação limpa reproduzível. A instalação e `prisma generate` precisam de autorização operacional específica; artefatos gerados não devem ser versionados.

### Validação após correções

1. criar worktree/ambiente de dependências limpo;
2. executar `npm ci` sem segredos remotos;
3. executar `prisma generate` com datasource local inválido ou descartável;
4. repetir 257 testes backend e 34 frontend;
5. exigir zero falhas;
6. repetir replay das 60 migrations;
7. repetir check-in concorrente real, fluxo completo de usuário e isolamento;
8. manter PROFILED desativado até autorização própria.

## 12. GO/NO-GO

### GO condicionado para B2.18.6

- corrigir as lacunas com allowlist revisada;
- implementar a interface B2 de usuários;
- definir bootstrap OWNER, limite de usuários e significado de CONSULTOR;
- alinhar runtime/dependências e separar build de alteração de banco;
- repetir a validação em instalação limpa e PostgreSQL descartável.

### NO-GO

- publicação, deploy, staging, commit ou push;
- ativação de PROFILED;
- conexão com Supabase, Render ou Stripe;
- uso da credencial exposta;
- migration, seed ou script de reparação fora de nova autorização;
- correção automática das precisões/default;
- considerar os testes atuais equivalentes a um fluxo frontend completo de usuários.

## 13. Restrições respeitadas

- nenhuma conexão ao Supabase, Render ou Stripe;
- nenhuma credencial remota usada ou exibida;
- nenhum arquivo funcional, migration, schema, package ou lockfile alterado;
- nenhum staging, commit, push, merge, rebase ou deploy;
- nenhum seed, `migrate resolve`, `db push` ou reparação;
- PROFILED permaneceu desativado;
- working tree original preservado;
- cluster local descartável removido;
- Fase C não iniciada.

Validação encerrada no limite autorizado da B2.18.5. Aguardando revisão antes da B2.18.6.
