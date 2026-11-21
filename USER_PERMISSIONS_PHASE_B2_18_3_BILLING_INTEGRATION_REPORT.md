# BASTIDOR OS — B2.18.3: Integração local de Billing, Stripe e ciclo de estabelecimentos

> Data: 11 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> Base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **integração local concluída; nenhuma conexão externa, instalação, migration, seed, staging ou commit executado**

## 1. Resultado executivo

Billing, Stripe e o ciclo de estabelecimentos foram integrados seletivamente no worktree isolado. A implementação mantém o modo de autorização `LEGACY`, preserva a integração B2.18.2, protege as rotas administrativas, valida assinaturas de webhook sobre o corpo bruto e trata idempotência tanto nas chamadas mutáveis ao Stripe quanto na persistência dos eventos.

Os testes locais autorizados terminaram com **45 aprovados e zero falhas**. O schema Prisma continua válido e com o mesmo hash da B2.18.1; as 60 migrations permanecem presentes, sem duplicatas e sem edição de migration rastreada. O working tree original permaneceu inalterado.

Há um gate novo de runtime: o SDK `stripe@23.0.1` exige Node.js `>=20`, enquanto o `package.json` ainda declara `>=18.0.0`. Essa divergência foi documentada, não corrigida automaticamente. Também continuam pendentes a auditoria read-only B2.14, a rotação da credencial PostgreSQL exposta, o replay local das 60 migrations e as decisões já conhecidas sobre precisão decimal, default de billing e locks.

Decisão: **GO condicionado para revisão e para a próxima integração local autorizada; NO-GO para deploy, banco remoto, ativação PROFILED, staging ou commit.**

## 2. Verificações iniciais e isolamento

| Gate | Resultado |
|---|---|
| Worktree/branch/HEAD | Confirmados no ambiente isolado autorizado |
| Schema inicial | Hash esperado da B2.18.1 |
| Migrations | 60 diretórios válidos |
| Modo de autorização | `LEGACY`; flags B2 mantidas desativadas nos testes |
| Staging | Vazio |
| Supabase/Render/Stripe | Nenhuma conexão |
| Working tree original | Branch e HEAD preservados; 243 entradas preexistentes e zero staged |

Identidade final do working tree original:

```text
branch: feat/user-permissions-migration-plan
HEAD:   288de0c86262bb4a1602a418bf5b36060cbe3ddf
```

## 3. Arquivos incorporados

### 3.1 Novos arquivos de Billing e Stripe

1. `backend/src/config/stripe.js`
2. `backend/src/constants/billing.js`
3. `backend/src/controllers/billingController.js`
4. `backend/src/controllers/organizationController.js`
5. `backend/src/routes/billingRoutes.js`
6. `backend/src/routes/organizationRoutes.js`
7. `backend/src/services/organizationBillingService.js`
8. `backend/src/services/stripeBillingService.js`
9. `backend/test/organizationBillingFlow.test.js`

Sete arquivos permaneceram byte a byte idênticos às fontes. O serviço Stripe e seu teste foram reconciliados dentro da allowlist para acrescentar idempotência explícita e cobertura de segurança.

| Arquivo reconciliado | SHA-256 final |
|---|---|
| `stripeBillingService.js` | `c8fbbb505aebb49c88be458cea75e03d5fc35104527c2412bb46304d7168d01d` |
| `organizationBillingFlow.test.js` | `d4efe58885ee9ce727560aa1878f372569e733aa699157ec2318e4c1a361e316` |

### 3.2 Arquivos compartilhados reconciliados manualmente

- `backend/src/app.js`;
- `backend/src/services/authService.js`;
- `backend/src/controllers/establishmentController.js`;
- `backend/src/routes/establishmentRoutes.js`.

O teste cumulativo `backend/test/legacyAuthorizationParity.test.js`, já pertencente à allowlist da B2.18.2, foi atualizado somente para refletir o inventário reconciliado de rotas. Nenhuma regra LEGACY foi relaxada.

### 3.3 Dependência

- `backend/package.json`;
- `backend/package-lock.json`.

Alterações controladas:

```text
stripe:  ^23.0.1
lock:    23.0.1
start:   node src/server.js
```

O gatilho estrutural anteriormente presente em `npm start` foi removido. `build`, `db:migrate` e `db:deploy` continuam existentes, mas não foram executados.

## 4. Reconciliação funcional

### Inicialização da aplicação

O endpoint do webhook foi montado antes do parser JSON:

```text
POST /api/billing/webhook -> express.raw(application/json)
express.json()            -> somente depois do webhook
```

Isso preserva os bytes usados pela verificação criptográfica da assinatura.

### Cadastro e assinatura

O cadastro reconciliado cria, na mesma transação local:

- organização;
- primeira unidade;
- assinatura em estado `PENDING`;
- categorias iniciais;
- usuário;
- vínculo `ADMIN` com a unidade.

O fluxo LEGACY de login, contexto e troca de estabelecimento da B2.18.2 foi preservado.

### Ciclo de estabelecimentos

Foram reconciliados:

- listagem e atualização somente de unidades ativas e escopadas ao tenant;
- criação de unidade com propagação do papel mais forte do usuário;
- sincronização da quantidade de unidades adicionais;
- marcação de sincronização pendente em caso de falha externa;
- inventário de impedimentos para arquivamento;
- arquivamento protegido por papel `ADMIN` e registro de auditoria.

### Rotas

Rotas financeiras mutáveis e de leitura administrativa exigem autenticação e papel `ADMIN`. A rota de webhook não usa autenticação de sessão; sua autoridade é a assinatura Stripe válida. A nova rota `DELETE /api/establishments/:id` também exige `ADMIN`.

O inventário reconciliado passou a conter:

```text
193 rotas legadas totais
183 rotas internas cobertas por paridade B2
```

## 5. Controles Stripe

### SDK e API

- SDK travado: `stripe@23.0.1`;
- API: `2026-09-30.endive`;
- configuração exige chave restrita, segredo do webhook e dois Price IDs;
- nenhum segredo foi incluído no código ou relatório.

### Idempotência

Foram confirmadas chaves explícitas para:

- criação de Customer;
- criação de Checkout Session;
- atualização de Subscription Item;
- criação de Subscription Item;
- remoção de Subscription Item.

Eventos recebidos são persistidos com unicidade por identificador. Duplicatas são tratadas sem repetir efeitos financeiros.

### Webhooks

Eventos tratados:

- `customer.subscription.created|updated|deleted|paused|resumed`;
- `invoice.paid|payment_succeeded|payment_failed`;
- `charge.dispute.created`;
- `charge.refunded`;
- `radar.early_fraud_warning.created`.

Assinatura ausente ou inválida falha de forma fechada. Evento sem assinatura local correspondente retorna erro e permanece elegível para retry, em vez de ser confirmado silenciosamente.

### Métodos de pagamento e Tax

O Checkout não fixa `payment_method_types`, permitindo que o Dashboard e a disponibilidade regional determinem os métodos compatíveis.

`automatic_tax` não foi habilitado. A ativação fiscal permanece fora do escopo até existir análise de registros fiscais, jurisdições, códigos de produto, endereço do cliente e responsabilidade tributária.

### Permissões mínimas sugeridas para futura restricted key

O inventário estático das chamadas requer, no mínimo:

| Recurso Stripe | Permissão necessária |
|---|---|
| Prices | leitura |
| Customers | escrita para criação |
| Checkout Sessions | escrita |
| Billing Portal Sessions | escrita |
| Subscriptions | leitura |
| Subscription Items | escrita |
| Charges | leitura |
| Invoices | leitura |

A verificação de webhook é local. Não foram identificadas chamadas de escrita para Refunds ou Disputes. As permissões finais devem ser confirmadas no Dashboard, separadas por ambiente e limitadas por IP quando a operação suportar essa restrição.

## 6. Dependências e lockfile

A tentativa de gerar apenas o lockfile em modo offline falhou com `ENOTCACHED`, antes de qualquer alteração. A tentativa de acesso ao registry não foi autorizada e não foi contornada.

Como alternativa local e sem rede, o manifesto e o lockfile foram reconciliados usando o pacote oficial `stripe@23.0.1` já presente no workspace original e sua entrada de lock existente. Não foram executados `npm install`, hooks, scripts ou downloads.

Validações:

```text
package.json stripe:       ^23.0.1
package-lock stripe:       23.0.1
npm ls --package-lock-only: aprovado
integridade do lock:       presente
dependências transitivas:  nenhuma declarada pelo pacote
```

### Gate de Node.js

```text
engines do projeto: >=18.0.0
engines do Stripe:  >=20
```

O ambiente de execução precisa ser confirmado em Node.js 20 ou superior antes de instalação, build ou deploy. Alterar o engine do projeto não estava autorizado nesta subetapa.

## 7. Testes executados

Ambiente de teste:

- `DATABASE_URL` forçada para `127.0.0.1:1`;
- Stripe inteiramente mockado;
- chaves Stripe removidas do processo;
- `USER_PERMISSIONS_ENABLED=false`;
- kill switch PROFILED desativado;
- dependências resolvidas somente do workspace local já existente.

Comando lógico:

```text
node --test
  legacyAdminAuth
  legacyAuthorizationParity
  organizationAuthority
  organizationBillingFlow
  permissionContracts
  permissionPersistence
  permissionResolver
  userAccessConfiguration
```

Resultado:

```text
45 testes aprovados
0 falhas
0 cancelados
0 ignorados
```

A cobertura inclui cadastro, cálculo de preços, tenant ativo, Checkout idempotente, sincronização idempotente, propagação do papel mais forte, bloqueios de arquivamento, assinatura de webhook, duplicatas, assinatura/fatura, eventos de risco, proteção das rotas e paridade das 183 rotas internas.

## 8. Verificações estáticas e de segurança

| Verificação | Resultado |
|---|---|
| `node --check` nos arquivos B2.18.3 e testes | Aprovado |
| `git diff --check` | Aprovado |
| `prisma validate` com URL de loopback inválida | Aprovado, sem conexão |
| Schema SHA-256 | `47b44778697099f55625d02c9b98dfb3f0d3bf93ebf716787425d5ae705ce8af` |
| Migrations | 60, sem nomes duplicados |
| Staging | Vazio |
| Chaves Stripe reais | Zero ocorrências |
| Supabase/segredos remotos | Zero ocorrências |
| URL PostgreSQL | Uma ocorrência de teste, somente loopback inválido |
| `automatic_tax` / `payment_method_types` no runtime | Ausentes |
| Prisma CLI mutável / SQL raw / `child_process` nos arquivos integrados | Ausentes |

O import estático da aplicação também foi exercitado com banco inválido e sem configuração Stripe. Ele concluiu sem abrir servidor, consultar banco ou chamar rede externa.

## 9. Integridade de migrations e schema

- exatamente 60 migrations continuam presentes;
- nenhuma migration foi criada, editada, aplicada ou marcada;
- nenhuma migration rastreada difere da base;
- o schema manteve o hash da B2.18.1;
- `prisma validate` foi aprovado;
- nenhum replay foi executado nesta etapa.

As integrações desta subetapa usam as estruturas billing e lifecycle já reconciliadas no schema B2.18.1; não houve nova alteração em `schema.prisma`.

## 10. Divergências e riscos pendentes

| Criticidade | Item | Gate |
|---|---|---|
| Crítica | Credencial PostgreSQL anteriormente exposta | Rotacionar antes de qualquer operação remota |
| Alta | B2.14 read-only ainda não executada | Confirmar história/checksums e estado real do Supabase |
| Alta | Stripe 23 exige Node >=20, projeto declara >=18 | Confirmar runtime e decidir engine em etapa autorizada |
| Alta | 60 migrations ainda sem replay reconciliado | Provar cadeia em PostgreSQL local descartável |
| Alta | `organization_subscriptions.updatedAt` tem default no SQL, mas só `@updatedAt` no schema | Decisão específica após auditoria |
| Alta | Build ainda contém migration e seed | Não usar `npm run build` em fluxo não autorizado; separar em mudança futura |
| Média | Oito precisões financeiras continuam pendentes | Auditoria agregada e plano de lock |
| Média | Cinco índices podem exigir `CONCURRENTLY` | Volume/janela/runbook |
| Média | Índices parciais B2 não são representáveis diretamente no Prisma | Validar por catálogo/SQL |
| Média | Restricted key e endpoint webhook ainda não provisionados | Configuração futura por ambiente, sem reutilizar segredo exposto |
| Média | Tax não configurado | Análise fiscal separada antes de habilitação |

## 11. Estado Git e restrições

Não houve `git add`, commit, push, merge, rebase ou cherry-pick. O índice permanece vazio. O worktree isolado contém cumulativamente os artefatos autorizados das B2.18.1, B2.18.2 e B2.18.3.

Não foram executados:

- conexão ao Supabase, Render ou Stripe;
- migration, seed, replay ou SQL;
- instalação de dependências;
- deploy;
- ativação PROFILED;
- alteração das precisões, default de billing ou Tax;
- alteração do working tree original;
- Fase C.

## 12. Recomendação GO/NO-GO

### GO condicionado

- aceitar a integração local de Billing, Stripe e lifecycle para revisão;
- aceitar `stripe@23.0.1` e a API `2026-09-30.endive`, condicionados a Node >=20;
- aceitar os 45 testes locais e a preservação LEGACY como evidência da subetapa;
- autorizar futuramente a próxima unidade local da matriz B2.17, mediante allowlist específica.

### NO-GO

- instalação, build, startup real ou deploy antes de confirmar Node >=20;
- conexão ou auditoria remota antes da B2.14 formalmente autorizada;
- uso da credencial PostgreSQL exposta;
- configuração de chaves Stripe, endpoint ou Tax nesta etapa;
- migration, seed ou replay fora de nova autorização;
- staging, commit ou push;
- ativação PROFILED ou início da Fase C.

Execução encerrada no limite autorizado da B2.18.3. Aguardando revisão.
