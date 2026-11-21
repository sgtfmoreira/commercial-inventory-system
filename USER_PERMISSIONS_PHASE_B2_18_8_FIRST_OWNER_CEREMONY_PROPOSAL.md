# BASTIDOR OS — B2.18.8: Proposta técnica da cerimônia segura do primeiro OWNER

> Data: 13 de novembro de 2026  
> Worktree de referência: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> Base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **proposta para revisão; nenhuma implementação, migration ou operação administrativa executada**

## 1. Decisão arquitetural

A B2.18.8 deve adotar um subsistema administrativo específico, sem endpoint público e sem reutilizar indevidamente `security_audit_events`.

São propostas três estruturas:

1. `FirstOwnerBootstrapOperation`: pedido, estado atual, alvo e identidade do solicitante/executor;
2. `FirstOwnerBootstrapApproval`: decisões imutáveis de dois aprovadores externos distintos;
3. `FirstOwnerBootstrapEvent`: trilha append-only, encadeada por hash, de toda a cerimônia.

A autoridade resultante continuará sendo um registro normal de `OrganizationAuthority`, com:

```text
type:               OWNER
verifiedByUserId:   null
verificationMethod: FIRST_OWNER_ADMIN_CEREMONY_V1
```

O vínculo entre a autoridade e a cerimônia ficará em `FirstOwnerBootstrapOperation.authorityId`. Assim, não é necessário alterar colunas de `organization_authorities`, tornar `SecurityAuditEvent.actorUserId` opcional ou representar um operador externo como se fosse usuário da aplicação.

## 2. Enums Prisma propostos

```prisma
enum FirstOwnerBootstrapStatus {
  PENDING_APPROVAL
  APPROVED
  REJECTED
  EXPIRED
  CANCELLED
  COMPLETED
}

enum FirstOwnerBootstrapDecision {
  APPROVE
  REJECT
}

enum FirstOwnerBootstrapActorKind {
  REQUESTER
  APPROVER
  EXECUTION_INITIATOR
  WORKLOAD
  SYSTEM
}

enum AdministrativeEnvironment {
  LOCAL
  STAGING
  PRODUCTION
}
```

Não é proposto estado persistido `EXECUTING`. A exclusão mútua será garantida por transação, row lock e advisory lock; isso evita operações permanentemente presas em estado intermediário após queda do processo.

## 3. Modelagem Prisma proposta

### 3.1 Operação administrativa

```prisma
model FirstOwnerBootstrapOperation {
  id                    String                    @id @default(uuid()) @db.Uuid
  requestId             String                    @unique @db.Uuid
  environment           AdministrativeEnvironment
  ticketId              String                    @db.VarChar(128)
  organizationId        String
  targetUserId          String                    @db.Uuid
  targetMembershipId    String                    @db.Uuid
  status                FirstOwnerBootstrapStatus @default(PENDING_APPROVAL)
  reason                String                    @db.VarChar(500)
  payloadHash           String                    @db.Char(64)
  confirmationHash      String                    @db.Char(64)

  requestedByIssuer     String                    @db.VarChar(512)
  requestedBySubject    String                    @db.VarChar(255)
  requestedByEmail      String?                   @db.VarChar(254)
  requestSessionHash    String                    @db.Char(64)
  requestMfaMethod      String                    @db.VarChar(64)
  requestMfaAt          DateTime
  requestedAt           DateTime                  @default(now())
  expiresAt             DateTime

  approvedAt            DateTime?
  completedAt           DateTime?
  cancelledAt           DateTime?
  cancellationReason    String?                   @db.VarChar(500)

  executionIssuer       String?                   @db.VarChar(512)
  executionSubject      String?                   @db.VarChar(255)
  executionSessionHash  String?                   @db.Char(64)
  executionMfaMethod    String?                   @db.VarChar(64)
  executionMfaAt        DateTime?

  authorityId           String?                   @unique @db.Uuid
  version               Int                       @default(1)
  createdAt             DateTime                  @default(now())
  updatedAt             DateTime                  @updatedAt

  organization          Organization              @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  targetUser            users                     @relation("FirstOwnerBootstrapTargetUser", fields: [targetUserId], references: [id], onDelete: Restrict)
  targetMembership      UserEstablishment         @relation("FirstOwnerBootstrapTargetMembership", fields: [targetMembershipId], references: [id], onDelete: Restrict)
  authority             OrganizationAuthority?    @relation("FirstOwnerBootstrapAuthority", fields: [authorityId], references: [id], onDelete: Restrict)
  approvals             FirstOwnerBootstrapApproval[]
  events                FirstOwnerBootstrapEvent[]

  @@unique([environment, ticketId])
  @@index([organizationId, status, createdAt])
  @@index([targetUserId, createdAt])
  @@index([expiresAt, status])
  @@map("first_owner_bootstrap_operations")
}
```

Observações:

- `requestId` é a chave idempotente pública da operação e deve ser UUID aleatório;
- `payloadHash` é SHA-256 do payload canônico imutável;
- `confirmationHash` vincula a frase digitada ao ambiente, organização, alvo, ticket e request ID;
- `requestSessionHash` e `executionSessionHash` são hashes do identificador de sessão/JTI; tokens nunca são persistidos;
- o endereço de e-mail externo é informativo; a identidade estável é `issuer + subject`;
- `authorityId` só é preenchido no commit que conclui a cerimônia.

### 3.2 Aprovações

```prisma
model FirstOwnerBootstrapApproval {
  id                   String                       @id @default(uuid()) @db.Uuid
  operationId          String                       @db.Uuid
  decision             FirstOwnerBootstrapDecision
  payloadHash          String                       @db.Char(64)
  approverIssuer       String                       @db.VarChar(512)
  approverSubject      String                       @db.VarChar(255)
  approverEmail        String?                      @db.VarChar(254)
  approvalSessionHash  String                       @db.Char(64)
  mfaMethod            String                       @db.VarChar(64)
  mfaAt                DateTime
  evidenceHash         String                       @db.Char(64)
  reason               String?                      @db.VarChar(500)
  createdAt            DateTime                     @default(now())

  operation            FirstOwnerBootstrapOperation @relation(fields: [operationId], references: [id], onDelete: Restrict)

  @@unique([operationId, approverIssuer, approverSubject])
  @@unique([operationId, evidenceHash])
  @@index([operationId, decision, createdAt])
  @@map("first_owner_bootstrap_approvals")
}
```

Cada identidade pode decidir uma única vez. Decisões são append-only: não existe alteração de voto; uma rejeição torna a operação terminal.

### 3.3 Eventos administrativos

```prisma
model FirstOwnerBootstrapEvent {
  id                 String                         @id @default(uuid()) @db.Uuid
  operationId        String                         @db.Uuid
  sequence           Int
  eventType          String                         @db.VarChar(80)
  actorKind          FirstOwnerBootstrapActorKind
  actorIssuer        String?                        @db.VarChar(512)
  actorSubject       String?                        @db.VarChar(255)
  sessionHash        String?                        @db.Char(64)
  payloadHash        String                         @db.Char(64)
  previousEventHash  String?                        @db.Char(64)
  eventHash          String                         @unique @db.Char(64)
  metadataJson       Json?
  occurredAt         DateTime                       @default(now())

  operation          FirstOwnerBootstrapOperation   @relation(fields: [operationId], references: [id], onDelete: Restrict)

  @@unique([operationId, sequence])
  @@index([operationId, occurredAt])
  @@index([eventType, occurredAt])
  @@map("first_owner_bootstrap_events")
}
```

Eventos mínimos:

```text
BOOTSTRAP_REQUESTED
BOOTSTRAP_APPROVED
BOOTSTRAP_REJECTED
BOOTSTRAP_EXPIRED
BOOTSTRAP_CANCELLED
BOOTSTRAP_EXECUTION_STARTED
BOOTSTRAP_EXECUTION_REJECTED
BOOTSTRAP_COMPLETED
```

O hash de cada evento cobre o hash anterior, a sequência, o request ID, o tipo, o ator, o payload canônico, os metadados canônicos e o timestamp. O hash final de uma operação concluída deve ser anexado ao ticket externo imutável para que um administrador de banco não consiga reescrever toda a cadeia sem detecção externa.

### 3.4 Relações reversas

Serão adicionadas apenas relações Prisma, sem novas colunas nessas tabelas:

```prisma
model Organization {
  // campos existentes
  firstOwnerBootstrapOperations FirstOwnerBootstrapOperation[]
}

model users {
  // campos existentes
  firstOwnerBootstrapTargets FirstOwnerBootstrapOperation[] @relation("FirstOwnerBootstrapTargetUser")
}

model UserEstablishment {
  // campos existentes
  firstOwnerBootstrapTargets FirstOwnerBootstrapOperation[] @relation("FirstOwnerBootstrapTargetMembership")
}

model OrganizationAuthority {
  // campos existentes
  firstOwnerBootstrapOperation FirstOwnerBootstrapOperation? @relation("FirstOwnerBootstrapAuthority")
}
```

## 4. Constraints adicionais na migration SQL

Algumas garantias não são representáveis somente no Prisma e devem constar explicitamente na migration.

### Checks

- hashes aceitam somente 64 caracteres hexadecimais minúsculos;
- `expiresAt > requestedAt`;
- `mfaAt <= requestedAt` e idade máxima validada também pela aplicação;
- `REJECT` exige `reason` não vazio;
- `COMPLETED` exige `authorityId`, `approvedAt`, `completedAt` e identidade de execução;
- estados não concluídos não podem possuir `authorityId`;
- `sequence > 0`.

### Índices parciais

```sql
CREATE UNIQUE INDEX first_owner_bootstrap_one_open_per_org
ON first_owner_bootstrap_operations ("organizationId")
WHERE status IN ('PENDING_APPROVAL', 'APPROVED');

CREATE UNIQUE INDEX first_owner_bootstrap_one_completed_per_org
ON first_owner_bootstrap_operations ("organizationId")
WHERE status = 'COMPLETED';
```

O primeiro impede duas cerimônias abertas para a mesma organização. O segundo formaliza que uma organização possui no máximo uma cerimônia inicial concluída, sem limitar designações OWNER normais posteriores.

### Triggers

1. `first_owner_bootstrap_approvals_no_update_or_delete`: aprovações são append-only;
2. `first_owner_bootstrap_events_no_update_or_delete`: eventos são append-only;
3. `first_owner_bootstrap_operations_no_delete`: operações nunca são removidas;
4. `first_owner_bootstrap_operation_guard`: impede alteração de request ID, ambiente, ticket, organização, alvo, payload, confirmação e identidade solicitante; aceita somente transições previstas;
5. `first_owner_bootstrap_approval_guard`: rejeita solicitante como aprovador, payload divergente, operação expirada/terminal e aprovação duplicada;
6. `first_owner_bootstrap_target_guard`: confirma que `targetMembershipId` pertence a `targetUserId`, está ativo, possui papel `ADMIN`, pertence à organização e aponta para estabelecimento ativo.

Transições permitidas:

```text
PENDING_APPROVAL -> APPROVED | REJECTED | EXPIRED | CANCELLED
APPROVED         -> COMPLETED | EXPIRED | CANCELLED
REJECTED         -> terminal
EXPIRED          -> terminal
CANCELLED        -> terminal
COMPLETED        -> terminal
```

A promoção para `APPROVED` exige duas aprovações `APPROVE`, de `issuer + subject` distintos, nenhuma rejeição e nenhuma identidade igual à do solicitante.

## 5. Migration incremental

Nome proposto:

```text
backend/prisma/migrations/20261113180000_add_first_owner_bootstrap_ceremony/migration.sql
```

Estratégia:

1. criar quatro enums;
2. criar as três tabelas novas;
3. criar PKs, FKs e constraints simples;
4. criar índices comuns e parciais;
5. criar funções e triggers de imutabilidade/consistência;
6. não executar backfill;
7. não criar nenhuma operação ou autoridade;
8. não alterar dados nem as 60 migrations anteriores.

A migration trabalha apenas com tabelas novas e FKs para estruturas existentes. Os índices são criados sobre tabelas vazias, portanto não há necessidade de `CONCURRENTLY`. Ela pode permanecer transacional.

Após a implementação, o conjunto passa de 60 para 61 migrations. A validação deverá reproduzir as 61 desde banco vazio e também aplicar somente a migration 61 sobre um replay das 60.

## 6. CLI administrativa

Arquivo proposto:

```text
backend/scripts/first-owner-bootstrap.js
```

Comandos:

```text
request  --request-id --environment --ticket --organization-id --target-user-id --target-membership-id --reason
approve  --request-id --payload-hash
reject   --request-id --payload-hash --reason
status   --request-id
execute  --request-id --payload-hash --confirm
verify   --request-id
```

### Regras da CLI

- não existe comando `--force`;
- não aceita identidade externa por parâmetros de texto;
- não aceita segredo compartilhado de longa duração;
- `request`, `approve`, `reject` e `execute` exigem autenticação fresca;
- `status` não exibe tokens, hashes de sessão completos ou metadados sensíveis;
- `execute` exige frase exata contendo ambiente, organização, usuário, ticket e request ID;
- `execute` começa em dry-run e exige opção explícita `--apply` além da confirmação;
- produção exige `FIRST_OWNER_BOOTSTRAP_ENABLED=true` e fingerprint do banco/ambiente conferido;
- a CLI recusa banco cuja identidade não corresponda ao ambiente declarado;
- a CLI não é adicionada ao servidor Express nem exposta por rota HTTP.

## 7. Autenticação dos operadores

A CLI deverá usar OIDC corporativo com MFA, preferencialmente Device Authorization + PKCE. O token precisa conter:

```text
iss   emissor permitido
aud   bastidor-owner-bootstrap
sub   identidade estável do operador
exp   validade curta
jti   identificador de sessão/token
acr/amr evidência de MFA
email informação auxiliar, nunca chave de identidade
```

Validações obrigatórias:

- assinatura contra JWKS do emissor allowlisted;
- issuer e audience exatos;
- expiração, `nbf` e clock skew limitado;
- MFA recente, no máximo cinco minutos para aprovação/execução;
- token nunca persistido ou impresso;
- persistência somente de `issuer`, `subject`, e-mail opcional, método/data de MFA e SHA-256 do JTI/sessão;
- falha fechada quando JWKS, MFA ou claims não puderem ser verificados.

Node 20 já fornece `fetch` e `crypto.createPublicKey` para JWK. `jsonwebtoken`, já instalado, pode verificar a assinatura; não é necessária nova dependência npm.

Em produção, a conexão de banco deve usar credencial curta emitida para uma workload administrativa específica. A identidade humana inicia a execução, mas a mutação é feita pela workload; ambas ficam registradas.

## 8. Aprovação por duas pessoas

1. o solicitante cria o pedido autenticado e recebe `payloadHash`;
2. aprovador A autentica com MFA, confere o payload e aprova;
3. aprovador B, com `issuer + subject` diferente, repete a conferência;
4. solicitante não pode ser aprovador;
5. a mesma pessoa não pode aprovar duas vezes, mesmo com e-mails diferentes;
6. qualquer rejeição torna a operação `REJECTED` e terminal;
7. a segunda aprovação válida promove a operação para `APPROVED` na mesma transação;
8. alteração de payload exige nova operação e novo request ID;
9. aprovação expira junto com a operação e não pode ser reaproveitada.

A execução pode ser iniciada por operador autenticado, mas a mutação será atribuída à workload e ao iniciador separadamente. Recomenda-se que o iniciador não seja o solicitante; essa separação será política obrigatória em `PRODUCTION`.

## 9. Idempotência e concorrência

### Idempotência

- `requestId` é único no banco;
- `environment + ticketId` é único;
- repetição do mesmo request ID e mesmo `payloadHash` retorna o estado existente;
- mesmo request ID com payload diferente falha com conflito;
- `authorityId` único impede vincular a mesma autoridade a duas cerimônias;
- operação `COMPLETED` repetida retorna a autoridade já vinculada sem nova escrita.

### Concorrência

`execute` deve operar em transação `Serializable`:

1. adquirir `pg_advisory_xact_lock` usando inteiro de 64 bits derivado por SHA-256 do UUID da organização;
2. bloquear a operação com `SELECT ... FOR UPDATE`;
3. revalidar status, expiração, payload e duas aprovações;
4. confirmar novamente alvo ativo/ADMIN e tenant;
5. contar OWNERs ativos dentro do lock e exigir zero;
6. criar `OrganizationAuthority`;
7. atualizar operação para `COMPLETED` e preencher `authorityId`;
8. inserir evento final encadeado;
9. commit único.

Dois requests aprovados para a mesma organização não podem concluir: o índice de operação aberta bloqueia o caso normal; o advisory lock e a revalidação de OWNER protegem inclusive estados legados ou intervenções externas.

Erros `P2034`/`40001` podem ser repetidos até três vezes. Falhas de validação não são repetidas. Uma tentativa transitória não muda o estado `APPROVED`; o erro sanitizado é registrado em evento separado sem expor credenciais.

## 10. Auditoria

A auditoria dedicada registra:

- pedido e payload canônico;
- cada aprovação/rejeição;
- expiração/cancelamento;
- início e falha sanitizada de execução;
- autoridade criada e conclusão;
- identidades externas estáveis;
- workload executora;
- ticket e request ID;
- cadeia de hashes.

As tabelas de aprovação e evento são append-only no PostgreSQL. A operação possui campos imutáveis protegidos por trigger. Após conclusão, o hash final deve ser anexado ao ticket externo ou log WORM para ancoragem fora do banco.

O evento existente `security_audit_events` não será usado para representar o operador externo, pois seu `actorUserId` obrigatório significaria atribuição incorreta. Operações OWNER posteriores continuam usando normalmente a auditoria existente.

## 11. Allowlist exata proposta para implementação

### Schema e migration

```text
backend/prisma/schema.prisma
backend/prisma/migrations/20261113180000_add_first_owner_bootstrap_ceremony/migration.sql
```

### Implementação administrativa

```text
backend/src/constants/firstOwnerBootstrap.js                         (novo)
backend/src/repositories/firstOwnerBootstrapRepository.js            (novo)
backend/src/services/administrativeIdentityService.js                (novo)
backend/src/services/firstOwnerBootstrapService.js                   (novo)
backend/src/validations/firstOwnerBootstrapValidation.js             (novo)
backend/scripts/first-owner-bootstrap.js                             (novo)
backend/package.json
```

`package.json` receberia somente um alias explícito, sem lifecycle:

```text
owner:first-bootstrap -> node scripts/first-owner-bootstrap.js
```

`package-lock.json` não precisa ser alterado, pois não é proposta nova dependência.

### Testes

```text
backend/test/firstOwnerBootstrapContracts.test.js                    (novo)
backend/test/administrativeIdentityService.test.js                   (novo)
backend/test/firstOwnerBootstrapService.test.js                      (novo)
backend/test/firstOwnerBootstrapCli.test.js                          (novo)
backend/test/firstOwnerBootstrapPostgres.test.js                     (novo)
```

### Relatório de execução

```text
USER_PERMISSIONS_PHASE_B2_18_8_FIRST_OWNER_CEREMONY_REPORT.md        (novo)
```

Não entram na allowlist:

- controllers ou rotas Express;
- frontend;
- `organizationAuthorityService.js`;
- `securityAuditRepository.js`;
- `security_audit_events`;
- migrations históricas;
- seed.

Qualquer necessidade posterior fora dessa lista deve interromper a implementação e voltar para autorização.

## 12. Plano de testes PostgreSQL local descartável

### Replay e upgrade

1. replay das 61 migrations em PostgreSQL 16 novo;
2. replay das 60 atuais, seguido somente da migration 61;
3. `prisma migrate status` sem drift operacional;
4. confirmar que a migration não cria operação nem OWNER;
5. confirmar schema e migrations históricas inalterados.

### Constraints

- request ID duplicado, com payload igual e diferente;
- ticket duplicado no mesmo ambiente;
- uma operação aberta e uma concluída por organização;
- requester tentando aprovar;
- aprovador repetido;
- payload divergente;
- rejeição sem motivo;
- alteração/exclusão de aprovação e evento;
- transição de estado inválida;
- alvo inativo, não ADMIN, cross-tenant ou em unidade arquivada;
- conclusão sem duas aprovações ou sem autoridade vinculada.

### Identidade

- token assinado por chave RSA local válida;
- issuer/audience incorretos;
- token expirado ou ainda não válido;
- MFA ausente ou antigo;
- JTI repetido;
- chave desconhecida/rotacionada;
- confirmação de que tokens não aparecem no banco, stdout, stderr ou eventos.

### Concorrência real

- duas execuções simultâneas do mesmo request;
- duas operações aprovadas para a mesma organização, criadas por fixture controlada;
- segundo OWNER surgindo entre aprovação e execução;
- alvo sendo desativado ou rebaixado entre aprovação e execução;
- duas segundas aprovações simultâneas;
- conflito serializável e retry;
- queda simulada antes e depois do commit.

Resultado exigido: exatamente uma autoridade, uma operação concluída e um evento final; todas as demais tentativas retornam o mesmo resultado idempotente ou falham fechadas.

### Auditoria

- sequência sem lacunas por operação;
- cadeia de hashes válida;
- rejeição de `UPDATE`/`DELETE`;
- hash final idêntico ao ancorado externamente no teste;
- falha de auditoria revertendo a autoridade.

### Regressão

- 265 testes backend existentes;
- 43 testes frontend existentes;
- operações OWNER normais após bootstrap;
- proteção do último OWNER;
- LEGACY como padrão;
- zero acessos PROFILED;
- nenhum endpoint público novo.

## 13. Riscos e mitigação

| Criticidade | Risco | Mitigação proposta |
|---|---|---|
| Crítica | Credencial administrativa reutilizável | Credencial curta de workload, escopo mínimo e revogação imediata |
| Crítica | Operador forjar identidade por flags | Identidade somente de token OIDC assinado; flags de identidade proibidas |
| Crítica | Dois primeiros OWNERs em corrida | Índices parciais, advisory lock, `Serializable` e revalidação dentro da transação |
| Crítica | Auditoria atribuir ação a usuário errado | Auditoria dedicada com identidades externas; não reutilizar `actorUserId` |
| Alta | Dois aprovadores serem a mesma pessoa | Unicidade por `issuer + subject`, não por e-mail |
| Alta | Token ou claims sensíveis persistidos | Armazenar somente claims mínimos e hashes de sessão |
| Alta | Reescrita completa da trilha por DBA | Append-only + cadeia de hashes + ancoragem externa WORM |
| Alta | Execução no banco/ambiente errado | Fingerprint, confirmação explícita e allowlist de ambiente |
| Alta | Aprovação de payload posteriormente alterado | Payload canônico imutável e hash assinado por cada aprovação |
| Média | JWKS indisponível ou rotacionado | Cache curto assinado/validado e falha fechada; runbook de rotação |
| Média | PII de operadores em excesso | Subject/issuer como chave; e-mail opcional e retenção definida |
| Média | Operação aprovada ficar esquecida | Expiração automática e evento `EXPIRED`; nova cerimônia exige novo request ID |

## 14. Compatibilidade LEGACY

A cerimônia cria somente autoridade organizacional OWNER. Ela não:

- altera `UserEstablishment.role`;
- cria ou ativa `UserEstablishmentAccess`;
- cria `AccessConfiguration`;
- muda `AuthorizationMode`;
- ativa `USER_PERMISSIONS_ENABLED`;
- desliga o kill switch;
- concede acesso a novos estabelecimentos;
- altera limites de usuários;
- expõe rota pública.

O candidato já precisa ser `ADMIN` ativo em pelo menos uma unidade da organização. Depois da cerimônia, o sistema continua em `LEGACY`; a autoridade permite administrar OWNERs e preparar configurações, mas não ativa `PROFILED`.

## 15. GO/NO-GO da proposta

### GO para implementação, somente após autorização explícita

- aprovar os três modelos dedicados;
- aprovar dois aprovadores externos distintos do solicitante;
- aprovar OIDC + MFA e workload administrativa curta;
- aprovar advisory lock, transação serializável e índices parciais;
- aprovar migration 61 aditiva e a allowlist exata;
- decidir política de ancoragem externa e retenção de PII.

### NO-GO atual

- alterar schema ou criar migration;
- implementar CLI ou serviço;
- executar bootstrap;
- criar endpoint público;
- staging, commit, push, deploy ou conexão remota;
- ativar PROFILED;
- iniciar automaticamente a implementação.

Proposta B2.18.8 encerrada para revisão. Nenhum arquivo funcional, schema ou migration foi alterado.
