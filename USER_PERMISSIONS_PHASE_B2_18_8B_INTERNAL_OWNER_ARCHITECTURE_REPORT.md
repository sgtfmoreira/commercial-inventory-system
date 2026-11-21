# BASTIDOR OS — B2.18.8B: Arquitetura definitiva do primeiro OWNER

> Data: 14 de novembro de 2026  
> Worktree de referência: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> Base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **revisão arquitetural concluída; nenhuma implementação, migration ou operação administrativa executada**

## 1. Resultado executivo

A cerimônia do primeiro OWNER deve ser uma operação interna do Bastidor OS, fora do servidor Express e inacessível a clientes. Para o porte atual, a arquitetura recomendada usa dois modelos persistentes:

1. `FirstOwnerBootstrapOperation`, que concentra pedido, alvo, aprovação, execução, idempotência e estado de ancoragem;
2. `FirstOwnerBootstrapEvent`, que mantém a trilha append-only encadeada por hash.

Uma tabela separada de aprovações não é necessária enquanto a política exigir exatamente uma segunda pessoa interna. A equivalência de segurança será mantida por:

- identidade canônica por pessoa, não por e-mail ou chave;
- uma única aprovação imutável vinculada ao hash exato do pedido;
- campos de aprovação preenchidos uma única vez e protegidos por trigger;
- evento `BOOTSTRAP_APPROVED` append-only;
- operador/executor e aprovador obrigatoriamente distintos em produção;
- revalidação integral dentro da transação que cria a autoridade.

Não existe atualmente OIDC, SAML, WebAuthn, JWKS ou diretório corporativo configurado no projeto. O repositório está no GitHub e o host dispõe de OpenSSH. A opção proporcional recomendada é autenticação humana por assinatura de desafio com chave física FIDO2 individual (`ed25519-sk`), PIN e toque, verificada contra um cadastro interno versionado de operadores.

O GitHub poderá armazenar uma evidência assinada em repositório privado separado e protegido. Isso fornece verificação independente, mas não é WORM real. Para a primeira liberação controlada, o mínimo recomendado é PostgreSQL append-only mais evidência independente assinada e protegida no GitHub. Object Lock/Immutable Blob permanece endurecimento posterior obrigatório antes de aumentar frequência, equipe ou automação.

Decisão: **GO condicionado para implementar o desenho de dois modelos e autenticação FIDO2 após autorização explícita. NO-GO para executar a cerimônia em produção até cadastrar pelo menos duas pessoas internas, validar as chaves físicas, preparar o repositório independente de evidências e aprovar o runbook operacional.**

## 2. Evidências da arquitetura existente

A revisão local confirmou:

- 60 migrations existentes, que devem permanecer imutáveis;
- `Organization.id` e `organizationId` são `String` sem `@db.Uuid` no schema atual;
- `users.id`, `UserEstablishment.id` e `OrganizationAuthority.id` são UUID;
- `UserEstablishment.role` é `String` e `isActive` é booleano;
- estabelecimentos possuem `organizationId`, `isActive` e `archivedAt`;
- `OrganizationAuthority` já admite `verifiedByUserId: null` e `verificationMethod: String`;
- `SecurityAuditEvent.actorUserId` é obrigatório e representa usuário da aplicação;
- o backend usa Node `>=20`, Prisma 5.22 e já possui `jsonwebtoken`, porém não há IdP administrativo configurado;
- o remote Git é GitHub;
- OpenSSH está instalado no host Windows;
- não há workflow, protected-environment config ou cadastro de operadores no repositório.

Consequências:

- a auditoria administrativa não deve reutilizar `SecurityAuditEvent`, pois um operador interno externo ao domínio da aplicação não possui `actorUserId` legítimo;
- nenhuma relação com `Organization` deve declarar UUID artificialmente;
- a primeira OWNER pode ser criada com `verifiedByUserId: null` e `verificationMethod: FIRST_OWNER_INTERNAL_CEREMONY_V1`;
- GitHub e OpenSSH são pontos de partida disponíveis, mas controles de branch, chaves físicas e regras organizacionais ainda precisam ser implantados.

## 3. Arquitetura final recomendada

```text
operador interno A
  -> autentica com chave física + PIN/toque
  -> cria pedido canônico e dry-run
  -> FirstOwnerBootstrapOperation(PENDING_APPROVAL)
  -> FirstOwnerBootstrapEvent(REQUESTED)

aprovador interno B, pessoa canônica diferente
  -> autentica com outra chave física + PIN/toque
  -> assina o mesmo payloadHash
  -> operação APPROVED + snapshot imutável da aprovação
  -> evento append-only APPROVED

executor interno A ou C
  -> autentica novamente
  -> dry-run atualizado + confirmação literal + --apply
  -> exporta recibo de intenção ao repositório independente
  -> transação Serializable + advisory lock por organização
  -> revalida alvo, aprovação e ausência de OWNER
  -> cria OrganizationAuthority
  -> operação COMPLETED_PENDING_ANCHOR + evento final
  -> exporta recibo de conclusão e verifica leitura
  -> operação COMPLETED + evento ANCHOR_VERIFIED
```

Não haverá:

- endpoint HTTP;
- botão no frontend;
- identidade recebida em argumento da CLI;
- segredo compartilhado entre operadores;
- promoção automática de ADMIN;
- alteração nos serviços normais de designação, revogação ou transferência OWNER;
- ativação de `PROFILED`.

## 4. Identidade administrativa

### 4.1 Recomendação: chaves físicas FIDO2 com OpenSSH

Cada pessoa interna autorizada recebe:

- um `personId` interno estável e não reutilizável;
- duas chaves físicas cadastradas, uma principal e uma de recuperação guardada separadamente;
- chave `ed25519-sk` criada com verificação de usuário obrigatória;
- papéis administrativos explícitos, como `REQUEST`, `APPROVE`, `EXECUTE` e `AUDIT`.

A CLI cria um desafio canônico contendo:

```text
namespace
action
nonce aleatório
issuedAt/expiresAt
requestId
environment
payloadHash
registryHash
```

O operador assina o desafio com a chave física. A CLI:

1. verifica a assinatura criptográfica;
2. exige presença física e o bit de user verification da assinatura `sk`;
3. resolve a fingerprint no cadastro interno;
4. deriva o `personId` e os papéis, sem aceitar identidade declarada pelo usuário;
5. rejeita desafio expirado, reutilizado ou assinado por chave revogada;
6. persiste apenas hashes e fingerprints, nunca chave privada, PIN ou token.

O fator de posse é a chave física. O segundo fator é o PIN/verificação local exigido pelo autenticador, além do toque. A implementação somente será aprovada se os testes demonstrarem que o bit de user verification é efetivamente validado; simples sucesso do `ssh-keygen -Y verify` não será aceito como prova suficiente.

### 4.2 Cadastro interno de operadores

Um arquivo versionado, sem segredos, mapeará fingerprints para pessoas:

```text
registryVersion
personId
displayLabel administrativo
keyFingerprint
roles
active/revokedAt
validFrom/validUntil
```

Regras:

- duas chaves da mesma pessoa apontam para o mesmo `personId`;
- distinção entre operador e aprovador usa `personId`, não fingerprint, conta ou e-mail;
- mudança no cadastro exige revisão por duas pessoas internas e proteção de branch;
- a CLI grava o hash e a versão exata do cadastro usados em cada ação;
- aprovação e execução revalidam que todas as identidades continuam ativas;
- revogar uma pessoa invalida também aprovações ainda não executadas;
- recuperação de chave exige cerimônia interna com duas pessoas e registro no repositório.

Isso impede que uma pessoa use duas chaves ou duas contas como se fossem dois aprovadores. O risco restante é uma inclusão fraudulenta de dois `personId` para a mesma pessoa; ele é mitigado pelo processo de enrollment presencial/documentado e pela revisão dupla do cadastro.

### 4.3 Alternativas avaliadas

| Alternativa | Adequação atual | Custo operacional | Risco principal | Decisão |
|---|---|---|---|---|
| Chave física FIDO2 + OpenSSH | Alta; OpenSSH já existe e não exige SaaS | Compra/guarda de chaves e cadastro manual | Perda de chave e governança do cadastro | **Recomendada** |
| GitHub Actions + protected environment | Média; GitHub já é usado | Configurar org, workflow, reviewers e secrets | Aprovação não prova MFA recente vinculada ao payload; runner teria acesso ao banco | Alternativa futura |
| OIDC hospedado (Entra, Okta, Auth0) | Baixa no momento; nada configurado | Contratação, tenant, MFA e lifecycle | Dependência e configuração desproporcionais agora | Reavaliar ao crescer |
| Keycloak próprio | Baixa | Patch, backup, HA, e-mail, MFA e plantão | Novo sistema crítico de identidade | Não recomendado agora |
| TOTP/segredo em cofre compartilhado | Inadequada | Baixo | Identidade compartilhada, sem não repúdio | Rejeitada |
| Nome/e-mail por flags ou variáveis | Inadequada | Baixo | Identidade forjável | Proibida |

As capacidades e preços comerciais de provedores não foram consultados remotamente nesta revisão. Antes de contratar qualquer serviço, termos, custos e recursos de MFA devem ser verificados em etapa própria.

## 5. Modelagem Prisma final

### 5.1 Enums

```prisma
enum FirstOwnerBootstrapStatus {
  PENDING_APPROVAL
  APPROVED
  COMPLETED_PENDING_ANCHOR
  COMPLETED
  REJECTED
  EXPIRED
  CANCELLED
  SUPERSEDED
}

enum FirstOwnerBootstrapActorKind {
  REQUESTER
  APPROVER
  EXECUTOR
  WORKLOAD
  SYSTEM
}

enum FirstOwnerBootstrapAnchorKind {
  INDEPENDENT_GIT_RECEIPT
  WORM_OBJECT
}

enum AdministrativeEnvironment {
  LOCAL
  STAGING
  PRODUCTION
}
```

Não haverá estado persistido `EXECUTING`. Exclusão mútua vem de lock transacional. `COMPLETED_PENDING_ANCHOR` existe porque PostgreSQL e o armazenamento externo não compartilham uma transação distribuída.

### 5.2 Operação

```prisma
model FirstOwnerBootstrapOperation {
  id                         String                          @id @default(uuid()) @db.Uuid
  requestId                  String                          @unique @db.Uuid
  environment                AdministrativeEnvironment
  ticketProvider             String                          @db.VarChar(64)
  ticketId                   String                          @db.VarChar(128)
  organizationId             String
  targetUserId               String                          @db.Uuid
  targetMembershipId         String                          @db.Uuid
  status                     FirstOwnerBootstrapStatus       @default(PENDING_APPROVAL)
  reason                     String                          @db.VarChar(500)
  payloadHash                String                          @db.Char(64)
  confirmationHash           String                          @db.Char(64)

  operatorRegistryVersion    String                          @db.VarChar(64)
  operatorRegistryHash       String                          @db.Char(64)
  identityHashKeyVersion     Int

  requesterPersonIdHash      String                          @db.Char(64)
  requesterKeyFingerprint    String                          @db.Char(64)
  requesterEvidenceHash      String                          @unique @db.Char(64)
  requestedAt                DateTime                        @default(now())
  expiresAt                  DateTime

  approverPersonIdHash       String?                         @db.Char(64)
  approverKeyFingerprint     String?                         @db.Char(64)
  approvalEvidenceHash       String?                         @unique @db.Char(64)
  approvedAt                 DateTime?

  executorPersonIdHash       String?                         @db.Char(64)
  executorKeyFingerprint     String?                         @db.Char(64)
  executionEvidenceHash      String?                         @unique @db.Char(64)
  executionStartedAt         DateTime?

  plannedAuthorityId         String?                         @unique @db.Uuid
  authorityId                String?                         @unique @db.Uuid

  anchorKind                 FirstOwnerBootstrapAnchorKind?
  intentReceiptHash          String?                         @db.Char(64)
  intentAnchorReferenceHash  String?                         @db.Char(64)
  intentAnchoredAt           DateTime?
  completionReceiptHash      String?                         @db.Char(64)
  completionAnchorReferenceHash String?                      @db.Char(64)
  completionAnchoredAt       DateTime?
  retentionUntil             DateTime?

  completedAt                DateTime?
  cancelledAt                DateTime?
  cancellationReason         String?                         @db.VarChar(500)
  version                    Int                             @default(1)
  createdAt                  DateTime                        @default(now())
  updatedAt                  DateTime                        @updatedAt

  organization               Organization                    @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  targetUser                 users                           @relation("FirstOwnerBootstrapTargetUser", fields: [targetUserId], references: [id], onDelete: Restrict)
  targetMembership           UserEstablishment               @relation("FirstOwnerBootstrapTargetMembership", fields: [targetMembershipId], references: [id], onDelete: Restrict)
  authority                  OrganizationAuthority?          @relation("FirstOwnerBootstrapAuthority", fields: [authorityId], references: [id], onDelete: Restrict)
  events                     FirstOwnerBootstrapEvent[]

  @@unique([environment, ticketProvider, ticketId])
  @@index([organizationId, status, createdAt])
  @@index([targetUserId, createdAt])
  @@index([expiresAt, status])
  @@map("first_owner_bootstrap_operations")
}
```

Identidades humanas são pseudonimizadas com HMAC-SHA-256 e chave versionada; SHA-256 simples de um identificador previsível não é suficiente. O cadastro de operadores permite resolver a identidade durante auditoria autorizada, mas o banco operacional não guarda e-mail ou token.

### 5.3 Eventos append-only

```prisma
model FirstOwnerBootstrapEvent {
  id                  String                         @id @default(uuid()) @db.Uuid
  operationId         String                         @db.Uuid
  sequence            Int
  eventType           String                         @db.VarChar(80)
  actorKind           FirstOwnerBootstrapActorKind
  actorPersonIdHash   String?                        @db.Char(64)
  actorKeyFingerprint String?                        @db.Char(64)
  evidenceHash        String?                        @db.Char(64)
  payloadHash         String                         @db.Char(64)
  previousEventHash   String?                        @db.Char(64)
  eventHash           String                         @unique @db.Char(64)
  metadataJson        Json?
  occurredAt          DateTime                       @default(now())

  operation           FirstOwnerBootstrapOperation   @relation(fields: [operationId], references: [id], onDelete: Restrict)

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
BOOTSTRAP_INTENT_ANCHORED
BOOTSTRAP_EXECUTION_STARTED
BOOTSTRAP_EXECUTION_REJECTED
BOOTSTRAP_SUPERSEDED
BOOTSTRAP_AUTHORITY_CREATED
BOOTSTRAP_COMPLETION_ANCHORED
```

### 5.4 Relações reversas

Serão acrescentadas relações Prisma, sem colunas novas nas tabelas existentes:

```prisma
model Organization {
  firstOwnerBootstrapOperations FirstOwnerBootstrapOperation[]
}

model users {
  firstOwnerBootstrapTargets FirstOwnerBootstrapOperation[] @relation("FirstOwnerBootstrapTargetUser")
}

model UserEstablishment {
  firstOwnerBootstrapTargets FirstOwnerBootstrapOperation[] @relation("FirstOwnerBootstrapTargetMembership")
}

model OrganizationAuthority {
  firstOwnerBootstrapOperation FirstOwnerBootstrapOperation? @relation("FirstOwnerBootstrapAuthority")
}
```

## 6. Constraints e transições

### 6.1 Checks

A migration deve impor:

- hashes com 64 caracteres hexadecimais minúsculos;
- `expiresAt > requestedAt`;
- `version > 0` e `sequence > 0`;
- aprovador diferente do solicitante e do executor em `PRODUCTION`;
- `APPROVED` exige todos os campos de aprovação;
- `COMPLETED_PENDING_ANCHOR` exige aprovação, executor, `plannedAuthorityId`, `authorityId`, recibo de intenção e `completedAt`;
- `COMPLETED` exige também recibo de conclusão e `completionAnchoredAt`;
- estados anteriores à execução não podem conter `authorityId`;
- `plannedAuthorityId = authorityId` quando concluída a mutação;
- cancelamento exige motivo;
- dados de ancoragem aparecem em conjunto, nunca parcialmente.

### 6.2 Índices parciais

```sql
CREATE UNIQUE INDEX first_owner_bootstrap_one_open_per_org
ON first_owner_bootstrap_operations ("organizationId")
WHERE status IN ('PENDING_APPROVAL', 'APPROVED');

CREATE UNIQUE INDEX first_owner_bootstrap_one_completed_per_org
ON first_owner_bootstrap_operations ("organizationId")
WHERE status IN ('COMPLETED_PENDING_ANCHOR', 'COMPLETED');
```

O segundo índice formaliza uma única cerimônia inicial concluída sem limitar OWNERs normais posteriores.

### 6.3 Triggers

1. eventos não admitem `UPDATE` ou `DELETE`;
2. operações não admitem `DELETE`;
3. campos do pedido, alvo, payload, solicitante e cadastro usado são imutáveis;
4. campos de aprovação podem passar de nulos para preenchidos uma única vez;
5. a aprovação só é aceita com evento correspondente, mesmo `payloadHash`, identidade ativa e pessoa diferente;
6. mudanças de estado seguem a máquina definida;
7. o alvo deve corresponder ao usuário, estar ativo como `ADMIN`, pertencer à organização e apontar para estabelecimento ativo e não arquivado;
8. a vinculação de autoridade deve corresponder à mesma organização, usuário e tipo `OWNER`;
9. a criação do evento seguinte exige `previousEventHash` igual ao último hash e sequência anterior + 1.

Transições permitidas:

```text
PENDING_APPROVAL          -> APPROVED | REJECTED | EXPIRED | CANCELLED
APPROVED                  -> COMPLETED_PENDING_ANCHOR | SUPERSEDED | EXPIRED | CANCELLED
COMPLETED_PENDING_ANCHOR  -> COMPLETED
REJECTED                  -> terminal
EXPIRED                   -> terminal
CANCELLED                 -> terminal
SUPERSEDED                -> terminal
COMPLETED                 -> terminal
```

O banco não consegue validar sozinho a assinatura FIDO2 ou o repositório remoto. Ele valida consistência relacional e imutabilidade; o serviço valida as provas criptográficas antes de escrever.

## 7. Aprovação e execução

### Pedido

1. operador com papel `REQUEST` autentica por chave física;
2. CLI resolve organização, usuário e membership sem mutação;
3. dry-run mostra ambiente, IDs, nome organizacional, alvo, papel e OWNERs atuais;
4. operador digita frase de confirmação;
5. CLI cria payload canônico, hash e operação `PENDING_APPROVAL`;
6. tentativa idêntica com mesmo `requestId` devolve a operação; payload divergente retorna conflito.

### Aprovação

1. pessoa com papel `APPROVE` consulta o pedido por `requestId`;
2. CLI sempre busca o payload do banco; não aceita payload livre;
3. aprovador confere os dados e assina um desafio novo vinculado ao `payloadHash`;
4. `personId` igual ao solicitante é rejeitado, mesmo com outra chave;
5. aprovação é gravada uma vez na operação e no evento append-only;
6. rejeição é terminal e exige motivo.

### Execução

1. executor com papel `EXECUTE` autentica novamente;
2. em produção, executor não pode ser o aprovador;
3. CLI repete dry-run e exige `--apply` mais frase literal;
4. revalida cadastro e não aceita aprovação de pessoa revogada;
5. grava e verifica recibo independente de intenção;
6. abre transação `Serializable` e adquire advisory lock derivado do UUID textual da organização por hash estável de 64 bits;
7. bloqueia a operação com `SELECT ... FOR UPDATE`;
8. revalida pedido, expiração, aprovação, alvo ativo/ADMIN, tenant e zero OWNER ativo;
9. cria `OrganizationAuthority` com ID previamente gerado, `verifiedByUserId: null` e método `FIRST_OWNER_INTERNAL_CEREMONY_V1`;
10. vincula a autoridade, grava evento e muda para `COMPLETED_PENDING_ANCHOR` no mesmo commit;
11. exporta recibo final, verifica leitura e muda para `COMPLETED` com novo evento.

Se um OWNER surgir por outro fluxo antes do passo 9, a operação passa a `SUPERSEDED`; a autoridade existente nunca é adotada nem vinculada retroativamente à cerimônia.

## 8. Idempotência e concorrência

- `requestId` é globalmente único;
- ambiente + provedor de ticket + ticket é único;
- cada prova de assinatura possui `evidenceHash` único;
- repetição de request com mesmo payload é leitura idempotente;
- repetição com payload diferente falha 409;
- repetição de aprovação retorna o estado existente somente se prova, pessoa e payload coincidirem;
- execução repetida em `COMPLETED_PENDING_ANCHOR` não cria autoridade; apenas tenta finalizar a ancoragem;
- execução repetida em `COMPLETED` devolve a autoridade já vinculada;
- `plannedAuthorityId` e `authorityId` únicos evitam associação ambígua;
- `Serializable`, row lock, advisory lock e revalidação garantem apenas uma criação;
- `P2034`/`40001` podem ser repetidos até três vezes; erros de domínio não são repetidos.

Uma falha antes do commit não cria OWNER. Uma queda após o commit deixa a operação em `COMPLETED_PENDING_ANCHOR`, com autoridade e auditoria PostgreSQL válidas; o comando `resume-anchor` conclui somente a exportação. A CLI deve retornar código não zero até a ancoragem final ser verificada.

## 9. Auditoria e retenção

### Nível 1 — integridade dentro do PostgreSQL

Obrigatório:

- eventos append-only por trigger;
- campos centrais imutáveis;
- cadeia de hashes e sequência sem lacunas;
- role de banco da CLI sem permissão de alterar triggers;
- transação única para autoridade, operação e evento;
- verificador offline da cadeia.

Limite: superusuário do banco ainda pode reescrever dados e triggers.

### Nível 2 — evidência independente

Mínimo recomendado para a primeira liberação em produção:

- repositório GitHub privado separado do código da aplicação;
- credencial de workload exclusiva, sem acesso administrativo à organização;
- branch protegida, force-push e exclusão bloqueados para mantenedores normais;
- recibos JSON canônicos com `requestId`, hashes, organização pseudonimizada, autoridade planejada, timestamps e assinaturas do operador/aprovador;
- confirmação por leitura após a gravação;
- commit SHA armazenado apenas como hash/referência no PostgreSQL;
- verificador capaz de comparar recibo, commit e cadeia do banco;
- backup periódico independente do repositório.

Isso é evidência independente e detecta alterações comuns, mas **não é WORM real**: um proprietário da organização GitHub ou o provedor ainda pode remover/regravar o repositório.

Falha de gravação do recibo de intenção impede a criação do OWNER. Falha do recibo final deixa `COMPLETED_PENDING_ANCHOR`, gera incidente operacional e deve ser retomada com o mesmo conteúdo; nunca se cria outra autoridade para “corrigir” a falha.

### Nível 3 — WORM real

Endurecimento posterior:

- S3 Object Lock em Compliance Mode, Azure Immutable Blob ou equivalente;
- política de retenção imposta pelo provedor;
- credencial apenas de criação/leitura, sem bypass de governança;
- versionamento e retenção verificados por teste periódico;
- replicação para conta/projeto separado.

Recomendação: níveis 1 e 2 são o mínimo para uma execução inicial rara e supervisionada, mediante aceitação formal do risco residual. Nível 3 deve tornar-se obrigatório antes de aumentar frequência, delegar a mais operadores ou automatizar o processo.

### Retenção e privacidade

- operação, eventos e recibos: sete anos, sujeito à validação jurídica;
- tokens, PINs, desafios brutos e chaves privadas: nunca persistidos;
- nonces usados: retenção até expiração operacional e depois somente hash;
- identificadores humanos no banco: HMAC pseudonimizado;
- cadastro nominal de operadores: acesso restrito e versionado enquanto a pessoa estiver ativa mais o período de auditoria;
- revogação não apaga histórico; marca a chave/pessoa como revogada;
- relatórios comuns exibem apenas rótulo administrativo minimizado e fingerprints truncadas.

## 10. CLI administrativa privada

Arquivo proposto:

```text
backend/scripts/first-owner-bootstrap.js
```

Comandos:

```text
request       --request-id --environment --ticket --organization-id --target-user-id --target-membership-id --reason
approve       --request-id
reject        --request-id --reason
status        --request-id
execute       --request-id --apply
resume-anchor --request-id
verify        --request-id
```

Regras:

- não há `--force`;
- `request`, `approve`, `reject`, `execute` e `resume-anchor` exigem assinatura fresca;
- identidade, papel e aprovação nunca vêm de argumentos ou variáveis de ambiente;
- caminho da chave pode ser selecionado, mas a identidade vem da assinatura verificada;
- comandos mutáveis usam desafio com validade máxima de cinco minutos;
- `execute` exige confirmação literal contendo ambiente, organização, usuário, ticket e request ID;
- produção requer feature flag operacional da ferramenta, fingerprint esperado do banco e cadastro assinado — esses controles não provam identidade;
- `child_process` deve usar argumentos em array e `shell: false` ao chamar OpenSSH/Git;
- stdout/stderr não exibem segredo, assinatura integral, DSN ou PII desnecessária;
- a CLI não é importada pelo servidor e não adiciona rota Express.

## 11. Migration incremental

Nome proposto:

```text
backend/prisma/migrations/20261114120000_add_internal_first_owner_bootstrap/migration.sql
```

Ordem:

1. criar os quatro enums;
2. criar `first_owner_bootstrap_operations`;
3. criar `first_owner_bootstrap_events`;
4. criar PKs, FKs e checks;
5. criar índices comuns e parciais;
6. criar funções e triggers;
7. adicionar somente as relações Prisma reversas;
8. não executar backfill;
9. não criar operação, evento ou OWNER;
10. preservar byte a byte as 60 migrations existentes.

O conjunto passa a 61 migrations. Devem ser testados replay vazio 1–61 e upgrade 1–60 seguido apenas da 61.

## 12. Allowlist exata proposta para implementação

### Schema e migration

```text
backend/prisma/schema.prisma
backend/prisma/migrations/20261114120000_add_internal_first_owner_bootstrap/migration.sql
```

### Cadastro e implementação administrativa

```text
backend/config/first-owner-operators.json                            (novo)
backend/src/constants/firstOwnerBootstrap.js                        (novo)
backend/src/repositories/firstOwnerBootstrapRepository.js           (novo)
backend/src/services/administrativeSignatureService.js              (novo)
backend/src/services/firstOwnerAuditAnchorService.js                (novo)
backend/src/services/firstOwnerBootstrapService.js                  (novo)
backend/src/validations/firstOwnerBootstrapValidation.js            (novo)
backend/scripts/first-owner-bootstrap.js                            (novo)
backend/package.json
```

`package.json` receberia somente alias sem lifecycle:

```text
owner:first-bootstrap -> node scripts/first-owner-bootstrap.js
```

Não é proposta dependência npm nova. `package-lock.json` não entra na allowlist. Se a implementação provar que o OpenSSH disponível não permite validar user verification com segurança, o trabalho deve parar e solicitar autorização para dependência específica; não se deve degradar silenciosamente para assinatura sem MFA.

### Testes

```text
backend/test/firstOwnerBootstrapContracts.test.js                   (novo)
backend/test/administrativeSignatureService.test.js                 (novo)
backend/test/firstOwnerAuditAnchorService.test.js                   (novo)
backend/test/firstOwnerBootstrapService.test.js                     (novo)
backend/test/firstOwnerBootstrapCli.test.js                         (novo)
backend/test/firstOwnerBootstrapPostgres.test.js                    (novo)
```

### Relatório

```text
USER_PERMISSIONS_PHASE_B2_18_8_FIRST_OWNER_CEREMONY_REPORT.md       (novo)
```

Não entram:

- controllers ou rotas Express;
- frontend;
- `organizationAuthorityService.js`;
- `securityAuditRepository.js` ou `security_audit_events`;
- migrations históricas;
- seed;
- package lock.

Qualquer necessidade adicional exige interrupção e autorização complementar.

## 13. Plano de implementação

| Etapa | Arquivos principais | Dependências | Critério de aprovação |
|---|---|---|---|
| 1. Schema/migration | schema + migration 61 | Prisma/PostgreSQL existentes | replay e upgrade aprovados; zero dados criados; 60 migrations intactas |
| 2. Identidade | registry + `administrativeSignatureService` | OpenSSH e chaves de teste | assinatura, UV, replay, revogação, papéis e mesma pessoa/duas chaves cobertos |
| 3. Aprovação/auditoria | constants, repository, bootstrap service, anchor service | Prisma + Git local em testes | transições, hashes, aprovação distinta e falhas de ancoragem fechadas |
| 4. CLI | validation, script e package alias | serviços anteriores | dry-run padrão, confirmação, sem `--force`, sem identidade declarada |
| 5. Unitários | cinco testes não PostgreSQL | doubles controlados | zero falhas e nenhum segredo em saída/log |
| 6. PostgreSQL local | teste PostgreSQL | PostgreSQL 16 descartável | constraints, locks, corrida e rollback reais aprovados |
| 7. Regressão | suíte existente | dependências do lockfile | 265 backend e 43 frontend, ou contagem maior, com zero falhas |

O adapter de auditoria deve usar um repositório Git local descartável nos testes. Nenhum GitHub remoto é necessário para desenvolver ou provar os contratos locais.

## 14. Plano de testes PostgreSQL local

### Migration

- replay 61 migrations desde banco vazio;
- replay 60 + aplicação isolada da 61;
- migration status atualizado;
- nenhum OWNER, operação ou evento criado pela migration;
- hashes das 60 migrations anteriores preservados.

### Identidade e aprovação

- assinatura válida e desafio expirado/reutilizado;
- assinatura de chave desconhecida ou revogada;
- ausência de user verification;
- papéis insuficientes;
- duas chaves do mesmo `personId` não satisfazem separação;
- solicitante tentando aprovar;
- aprovador tentando executar em produção;
- alteração do cadastro entre aprovação e execução;
- evidência duplicada;
- payload divergente.

### Constraints e triggers

- mutação/exclusão de eventos;
- mutação de pedido ou aprovação;
- transição inválida;
- alvo inativo, não ADMIN, cross-tenant ou em unidade arquivada;
- autoridade de outra organização/usuário;
- conclusão sem aprovação ou âncora de intenção;
- sequência e cadeia de hash inválidas.

### Concorrência real

- duas execuções do mesmo request;
- duas operações forçadas por fixture para mesma organização;
- OWNER normal surgindo entre aprovação e execução;
- alvo desativado/rebaixado durante a cerimônia;
- aprovação e rejeição concorrentes;
- retry de serialização;
- queda antes do commit;
- queda após commit e antes da ancoragem final;
- retomada de `COMPLETED_PENDING_ANCHOR`.

Resultado obrigatório: no máximo uma autoridade da cerimônia, vínculo exato com uma operação, eventos sem lacunas e todas as demais tentativas idempotentes ou fechadas.

### Auditoria

- repositório Git local separado recebe recibo de intenção e conclusão;
- hash/commit lido de volta coincide;
- falha da intenção impede OWNER;
- falha da conclusão mantém estado recuperável;
- verificador detecta alteração no banco ou recibo;
- tokens, PINs, DSN e chaves privadas não aparecem em banco ou logs.

### Regressão

- suíte backend completa;
- 43 testes frontend;
- designação/transferência/revogação normal de OWNER após bootstrap;
- proteção do último OWNER;
- modo `LEGACY` preservado;
- zero `UserEstablishmentAccess` em `PROFILED`;
- inventário confirma ausência de endpoint novo.

## 15. Riscos residuais

| Criticidade | Risco | Tratamento |
|---|---|---|
| Crítica | Chave física e PIN comprometidos juntos | revogação imediata, chave reserva separada, assinatura fresca e segunda pessoa |
| Crítica | Cadastro fraudulento cria duas identidades para uma pessoa | enrollment documentado e revisão dupla; auditoria de mudanças do registry |
| Crítica | Executor aponta para banco errado | fingerprint do banco, ambiente no desafio e confirmação literal |
| Crítica | Dois OWNERs em corrida | índice parcial, `Serializable`, advisory lock e revalidação |
| Alta | GitHub não é WORM | declarar limitação, backup independente e migrar para Object Lock antes de escalar |
| Alta | Falha após commit antes do recibo final | estado `COMPLETED_PENDING_ANCHOR`, retry idempotente e incidente |
| Alta | Superusuário reescreve PostgreSQL | evidência externa assinada e comparação periódica |
| Alta | OpenSSH verifica assinatura mas não UV | parser/teste obrigatório dos flags FIDO; NO-GO se não comprovado |
| Média | Perda das duas chaves de uma pessoa | duas chaves separadas e processo de recuperação por dois custodians |
| Média | Repositório de evidência indisponível | intenção falha fechada; conclusão entra em estado recuperável |
| Média | Pseudônimo humano se tornar irrecuperável | chave HMAC versionada e cadastro nominal sob retenção controlada |

## 16. Compatibilidade LEGACY

A cerimônia cria somente uma `OrganizationAuthority` do tipo OWNER. Ela não:

- altera `UserEstablishment.role`;
- cria ou ativa `UserEstablishmentAccess`;
- cria `AccessConfiguration`;
- muda `AuthorizationMode`;
- ativa flags de permissões;
- desliga kill switch;
- concede acesso a estabelecimento;
- altera limite de usuários;
- modifica contratos normais de OWNER;
- expõe rota pública.

O alvo deve ser ADMIN ativo existente na organização. Ao fim, toda autorização operacional permanece `LEGACY`.

## 17. GO/NO-GO

### GO condicionado para implementação

- adotar os dois modelos propostos;
- aprovar chaves físicas FIDO2 como identidade humana inicial;
- aprovar cadastro interno por `personId` com duas chaves por pessoa e revisão dupla;
- aprovar uma segunda pessoa distinta para produção;
- aprovar evidência independente em repositório GitHub privado protegido como mínimo inicial, reconhecendo que não é WORM;
- aprovar migration 61 aditiva e a allowlist exata;
- implementar e validar tudo apenas em ambiente local até nova autorização.

### NO-GO para execução operacional

- executar bootstrap antes de cadastrar e testar duas pessoas internas;
- aceitar assinatura sem comprovação de user verification;
- usar identidade informada por flag, e-mail ou variável;
- executar sem recibo independente de intenção;
- liberar produção sem repositório de auditoria separado, credencial curta de workload e runbook de recuperação;
- tratar GitHub como WORM real;
- criar endpoint, alterar frontend ou modificar administração normal de OWNER;
- ativar `PROFILED`;
- staging, commit, push, deploy ou acesso a banco/serviço remoto nesta fase.

B2.18.8B concluída como revisão técnica. Nenhum schema, migration, código funcional ou teste foi modificado, e nenhuma cerimônia foi executada.
