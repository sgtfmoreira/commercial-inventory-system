# BASTIDOR OS — B2.21: PRD e plano técnico do módulo operacional de checklists

> Data: 17 de novembro de 2026  
> Worktree de referência: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> HEAD/base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado em 22 de novembro de 2026: **Entregas 1–6 em produção; extensão B2.21.7 de agendamento semanal implementada e validada localmente, aguardando migration 68 e gate de produção**

> Nota de evolução: este documento preserva o plano e as decisões originais de 17 de novembro. O estado executado está detalhado nos relatórios B2.21.1–B2.21.7, incluindo [atribuição manual](./CHECKLISTS_PHASE_B2_21_3_MANUAL_ASSIGNMENT_REPORT.md) e [agendamento semanal](./CHECKLISTS_PHASE_B2_21_7_WEEKLY_SCHEDULING_REPORT.md). Menções posteriores a “proposta”, “nenhuma migration” ou recorrência fora do escopo devem ser lidas como gates históricos anteriores às autorizações já concluídas.

## 1. Resultado executivo

O módulo deve ser construído como um domínio operacional novo, multi-tenant e orientado a execuções por estabelecimento. Para o MVP, o desenho recomendado separa:

1. catálogo organizacional: templates reutilizáveis e versionados;
2. atribuição manual: criação pontual, responsável ativo, prazo e reatribuição justificada;
3. execução: ocorrências concretas, respostas, evidências e pontuação;
4. controle: aprovação, retrabalho, histórico imutável e relatórios.

O catálogo B2 contém as três capacidades originais relacionadas ao domínio:

```text
checklists.templates.manage
checklists.execute
checklists.approve
```

Elas continuam adequadas para templates, execução e aprovação, mas não distinguem gerenciamento de modelos de criação/distribuição de ocorrências. Para cumprir a decisão de produto sem sobrecarregar `checklists.templates.manage`, o PRD passa a propor uma quarta capacidade:

```text
checklists.runs.manage
```

Ela foi implementada como capacidade indelegável, de escopo de estabelecimento, reservada aos perfis `ADMINISTRATOR` e `MANAGER`. O perfil `OWNER` continua podendo gerenciar templates, executar e aprovar, mas não pode criar, atribuir ou reatribuir ocorrências.

O catálogo também não possui uma capacidade somente-leitura de checklists. Como consequência, o perfil `AUDITOR` não terá acesso ao módulo no primeiro recorte, a menos que seja aprovada futuramente uma capacidade como `checklists.read` ou `checklists.reports.read`.

As Entregas 1–6 implementaram modelos Prisma, migrations 61 a 65, APIs, serviços e páginas para templates, distribuição manual, execução, respostas, evidências locais, submissão, aprovação, rejeição, retrabalho, histórico e relatórios agregados. As fotos usam adapter de filesystem temporário e privado para desenvolvimento; nenhum provider remoto foi ativado. A validação final preservou a matriz dos seis perfis sem ampliar silenciosamente o acesso do `AUDITOR`. A ausência de scheduler/queue não bloqueia o MVP, porque toda execução nasce pontualmente e é atribuída de forma manual.

Decisão atual: **Entregas 1–6 concluídas localmente e escopo técnico planejado do MVP implementado. NO-GO para storage remoto, ampliação de acesso do AUDITOR, ativação, publicação ou produção sem autorização complementar.**

## 2. Objetivos do produto

### 2.1 Objetivo principal

Permitir que cada organização padronize rotinas operacionais e que cada estabelecimento crie pontualmente, atribua, execute, aprove e audite checklists.

### 2.2 Resultados esperados

- templates reutilizáveis e versionados pela organização;
- execução sempre vinculada a um estabelecimento;
- responsável selecionado manualmente entre memberships ativos da unidade;
- reatribuições justificadas e rastreáveis sem transferência de privilégios;
- respostas e fotos associadas ao item exato do template;
- cálculo de pontuação reproduzível no backend;
- aprovação ou rejeição com separação de responsabilidades;
- histórico preservado mesmo após novas versões do template;
- relatórios por período, unidade, template, versão e responsável;
- isolamento integral entre organizações e estabelecimentos.

### 2.3 Fora do escopo inicial

- funcionamento offline completo e sincronização conflitante;
- biometria, geofencing ou reconhecimento de imagem;
- assinatura eletrônica qualificada;
- comunicação por WhatsApp, SMS ou push;
- geração inteligente de templates;
- WORM externo para todo evento operacional;
- execução por usuário sem vínculo ativo no estabelecimento;
- funções operacionais, turnos, escalas e recorrências;
- geração automática ou atribuição automática de execuções;
- alteração do modo PROFILED ou do catálogo B2 sem decisão específica.

O MVP será online, mas deverá salvar progresso de forma idempotente e tolerar repetição de requisições.

### 2.4 Escopo revisado do MVP

Incluído:

- template reutilizável e versionado;
- criação pontual de execução por usuário autorizado;
- seleção manual de um responsável elegível da unidade;
- prazo, status e identificação do criador, responsável e executor real;
- reatribuição manual com justificativa e histórico imutável;
- respostas, fotos, pontuação, aprovação, retrabalho, histórico e relatórios;
- operação LEGACY e PROFILED com as três capacidades existentes e a nova capacidade de distribuição proposta.

Excluído do MVP:

- funções operacionais;
- turnos e responsáveis por turno;
- escalas;
- recorrência e geração automática;
- atribuição automática;
- substituições programadas por janela de turno;
- scheduler, cron ou queue.

Esses recursos poderão ser adicionados depois como uma camada de planejamento sobre `ChecklistRun`, sem mudar o histórico das execuções manuais do MVP.

## 3. Auditoria do que já existe

### 3.1 Estruturas reutilizáveis

| Estrutura atual | Reutilização proposta |
|---|---|
| `Organization` | proprietário dos templates reutilizáveis |
| `establishments` | limite obrigatório de toda ocorrência e execução |
| `users` | identidade humana global; não deve ser usada sozinha para atribuição local |
| `UserEstablishment` | identidade operacional correta para responsável, substituto, executor e aprovador |
| `UserEstablishmentAccess` | fonte do modo LEGACY/PROFILED do vínculo |
| `AccessConfiguration` e `PermissionOverride` | resolução B2 já existente; nenhuma regra nova dentro dessas tabelas |
| `OrganizationAuthority` | continua separada; perfil OWNER de unidade não cria autoridade organizacional |
| `SecurityAuditEvent` | espelho de ações administrativas e sensíveis do módulo |
| transações Prisma/PostgreSQL | padrão para locks, idempotência e concorrência |

### 3.2 Padrões técnicos aproveitáveis

- serviços recebem o tenant do contexto autenticado, não do corpo como fonte de autoridade;
- validação de vínculo e estabelecimento ativos;
- transações e optimistic locking por `version`;
- auditoria com ator e membership;
- estados DRAFT/ACTIVE e histórico de configurações;
- respostas HTTP fechadas com 401/403/409 conforme contrato;
- componentes React existentes: `Button`, `Card`, `Modal`, `Tabs`, `Badge`, `EmptyState`, campos de formulário e tabelas responsivas.

### 3.3 Lacunas reais

- nenhum modelo ou endpoint de checklist;
- nenhuma entidade de execução ou histórico de reatribuição;
- nenhum storage privado de imagens;
- frontend ainda não recebe o conjunto efetivo de capacidades do usuário;
- navegação React ainda é majoritariamente orientada pelo papel LEGACY;
- nenhuma capacidade de checklist somente-leitura para o perfil `AUDITOR`;
- `establishments.organizationId` ainda é opcional no schema legado; o módulo deve falhar fechado quando ele estiver ausente.

## 4. Personas e responsabilidades

### Gestor de templates

Cria templates, versões e publica modelos. Necessita `checklists.templates.manage`, mas essa capacidade não autoriza distribuir execuções.

### Gestor de execuções

Cria execuções pontuais, define prazo, escolhe responsável e realiza reatribuições justificadas. Necessita `checklists.runs.manage`, vínculo ativo na unidade e perfil efetivo `ADMINISTRATOR` ou `MANAGER`.

### Executor

Visualiza somente ocorrências que pode executar, responde itens, anexa evidências e envia. Necessita `checklists.execute`, vínculo ativo e atribuição vigente.

### Aprovador

Analisa execuções submetidas, fotos, pontuação e histórico; aprova ou rejeita com justificativa. Necessita `checklists.approve` no mesmo estabelecimento.

### Auditor/consulta

Necessidade de produto válida, mas não coberta pelo catálogo atual. O perfil B2 `AUDITOR` possui apenas permissões com ação `read`; as três capacidades de checklist usam `manage`, `execute` e `approve`. Acesso somente-leitura deverá ser decidido em gate separado.

## 5. Matriz de autorização proposta

### 5.1 Compatibilidade com o catálogo e overrides atuais

A regra não pode ser expressa corretamente apenas com `checklists.templates.manage`:

- hoje `OWNER`, `ADMINISTRATOR` e `MANAGER` recebem essa capacidade base;
- `SUPERVISOR` e `COLLABORATOR` não a recebem por padrão;
- como ela é delegável, um override `ALLOW` também pode concedê-la a outro perfil;
- usar a mesma capacidade acoplaria edição de templates e distribuição de ocorrências;
- uma checagem apenas por ordem hierárquica também falharia, pois `OWNER` possui nível superior, mas foi excluído expressamente desta ação.

A menor alteração futura coerente é:

1. adicionar `checklists.runs.manage` ao catálogo, com ação `manage`, escopo de estabelecimento e `delegable: false`;
2. incluí-la somente nas permissões-base de `ADMINISTRATOR` e `MANAGER`;
3. excluí-la explicitamente de `OWNER`, apesar de o perfil OWNER hoje herdar o catálogo completo;
4. não incluí-la em `SUPERVISOR`, `COLLABORATOR` ou `AUDITOR`;
5. permitir que override `DENY` a remova de ADMINISTRATOR/MANAGER;
6. impedir que override `ALLOW` a conceda a qualquer perfil, inclusive OWNER;
7. manter `checklists.templates.manage`, `checklists.execute` e `checklists.approve` com suas finalidades atuais.

O resolvedor atual já respeita `DENY` antes de `ALLOW` e ignora `ALLOW` para capacidades indelegáveis. A implementação futura precisará apenas ajustar catálogo, composição dos perfis e testes contratuais; não é necessário alterar o algoritmo do resolvedor.

Menor superfície futura de alteração para essa regra:

```text
backend/src/constants/permissions.js       nova capacidade indelegável
backend/src/constants/accessProfiles.js    inclusão em ADMINISTRATOR/MANAGER e exclusão de OWNER
backend/test/permissionContracts.test.js   matriz base e indelegabilidade
backend/test/permissionResolver.test.js    DENY permitido e ALLOW recusado
```

As rotas de checklist e o fallback LEGACY serão adicionados apenas nas entregas funcionais autorizadas. Nenhum desses arquivos foi modificado nesta revisão do PRD.

### 5.2 Matriz revisada dos perfis B2

| Perfil | Templates | Criar/atribuir/reatribuir | Executar atribuído | Aprovar | Observação |
|---|---:|---:|---:|---:|---|
| OWNER | sim | **não** | sim | sim | não recebe `checklists.runs.manage`; autoridade organizacional não é bypass |
| ADMINISTRATOR | sim | sim | sim | sim | recebe a nova capacidade base, sujeita a `DENY` |
| MANAGER | sim | sim | sim | sim | recebe a nova capacidade base, sujeita a `DENY` |
| SUPERVISOR | não | não | sim | sim | executa apenas se atribuído; não distribui ocorrências |
| COLLABORATOR | não | não | sim | não | executa apenas ocorrências atribuídas a ele |
| AUDITOR | não | não | não | não | lacuna de leitura a decidir |

Overrides B2 continuam válidos: `DENY` prevalece e pode retirar a ação de ADMINISTRATOR/MANAGER; `ALLOW` não pode conceder `checklists.runs.manage`, e a decisão é reavaliada em cada ação.

### 5.3 Regras adicionais de domínio

Possuir uma capacidade não elimina o escopo operacional:

- toda ação exige membership ativo no estabelecimento da ocorrência;
- templates pertencem à organização, mas publicação e uso devem respeitar a organização do ator;
- atribuição usa `UserEstablishment.id`, nunca apenas `userId`;
- o responsável deve pertencer ao mesmo estabelecimento e possuir `checklists.execute` no momento da atribuição, do início e da submissão;
- atribuir ou reatribuir responsabilidade não concede capacidade;
- criar, atribuir e reatribuir execução exige `checklists.runs.manage` no estabelecimento;
- reatribuição exige justificativa não vazia e evento histórico append-only;
- o executor não pode aprovar a própria tentativa;
- o aprovador não pode editar respostas ou recalcular manualmente a pontuação;
- configuração `DENY` entra em vigor imediatamente, inclusive para ocorrência já atribuída;
- unidade ou vínculo inativo bloqueia início, retomada, submissão e aprovação;
- IDs de organização/estabelecimento enviados pelo cliente são filtros, não autoridade.

### 5.4 LEGACY e PROFILED

As novas rotas deverão usar `requireCapability` com fallback LEGACY explícito:

```text
templates.manage -> ADMIN
run.manage        -> ADMIN, MANAGER
approve          -> ADMIN, MANAGER
execute          -> ADMIN, MANAGER, STAFF, STOCK_COUNTER, desde que atribuído
```

No modo PROFILED, `checklists.runs.manage` será decidida pelo perfil efetivo e overrides, conforme a matriz acima. No modo LEGACY, somente os papéis `ADMIN` e `MANAGER` poderão distribuir ocorrências. Uma `OrganizationAuthority(OWNER)` não concede bypass: se o membership não estiver autorizado pelo modo vigente, a criação/reatribuição será negada.

Os nomes exatos dos papéis LEGACY deverão ser confrontados com o inventário real no início da implementação. Todas as rotas deverão entrar nos testes de inventário/paridade. Nenhuma ativação PROFILED será necessária para usar o módulo em LEGACY.

## 6. Fluxo funcional completo

### 6.1 Configuração

1. gestor cria template em DRAFT;
2. adiciona seções, itens, tipos de resposta, pesos, criticidade e exigência de foto;
3. preview valida ordem, pontuação, campos obrigatórios e regras de evidência;
4. publicação cria versão imutável;
5. alterações futuras clonam a versão publicada para um novo DRAFT.

### 6.2 Criação pontual e atribuição manual

1. usuário com `checklists.runs.manage` escolhe um template publicado e o estabelecimento atual;
2. informa o prazo e seleciona manualmente um responsável;
3. o backend lista e aceita somente memberships ativos da mesma unidade com `checklists.execute` efetiva;
4. a ocorrência fixa a versão exata do template, o criador, o responsável e o prazo;
5. `clientRequestId` torna a criação idempotente e impede duplicação por retry;
6. usuário autorizado pode reatribuir a ocorrência antes da conclusão;
7. a reatribuição revalida unidade, vínculo e capability do novo responsável, exige justificativa e preserva responsável anterior, ator e timestamp no histórico;
8. uma reatribuição não muda respostas já registradas nem a identidade de quem efetivamente executou cada tentativa.

### 6.3 Execução

1. executor acessa a fila “Meus checklists”;
2. backend revalida membership, atribuição e capacidade;
3. ao iniciar, é criada uma tentativa numerada;
4. respostas são salvas incrementalmente com optimistic locking;
5. evidências são vinculadas à resposta e validadas no servidor;
6. submissão valida itens obrigatórios, evidências e tipos;
7. pontuação e resultado são calculados pelo backend;
8. tentativa submetida torna-se imutável.

### 6.4 Aprovação e retrabalho

1. checklist que exige aprovação entra em `SUBMITTED`;
2. aprovador distinto do executor revisa respostas, evidências e falhas críticas;
3. `APPROVE` encerra a ocorrência;
4. `REJECT` exige justificativa e abre possibilidade de nova tentativa;
5. nova tentativa não altera nem apaga a anterior;
6. ações concorrentes de aprovar/rejeitar são protegidas por versão e transação.

### 6.5 Histórico e relatórios

O histórico deverá mostrar:

- versão do template usada;
- responsável original e todas as reatribuições justificadas;
- início, salvamentos relevantes, submissões, rejeições e aprovação;
- respostas e evidências de cada tentativa;
- pontuação, itens críticos e prazo;
- ator de cada ação e timestamps UTC;
- motivo de cancelamento, rejeição ou exceção.

Relatórios iniciais:

- conformidade e pontuação média;
- execução no prazo, atraso e ausência;
- falhas por item e itens críticos;
- desempenho por unidade, template, versão e responsável;
- volume por executor e aprovador;
- comparação entre períodos sem misturar silenciosamente versões incompatíveis.

## 7. Regras de pontuação

- cada item publicado contém `maxPoints` e regra de obtenção dos pontos;
- o backend calcula `earnedPoints`, nunca confia na pontuação do cliente;
- score percentual = pontos obtidos / pontos aplicáveis × 100;
- `N/A` somente é aceito quando o item permitir e retira seus pontos do denominador;
- item obrigatório não pode ficar sem resposta;
- falha em item crítico torna o resultado não conforme, mesmo acima do limiar;
- limiar de aprovação pertence à versão do template;
- resposta, pontos possíveis, pontos obtidos e algoritmo/versionamento ficam congelados na tentativa submetida;
- aprovação não reescreve a pontuação;
- qualquer exceção futura exigirá justificativa e evento próprio.

## 8. Modelo de dados proposto

Os nomes abaixo são proposta para revisão, não schema autorizado.

### 8.1 Catálogo e versão

#### `ChecklistTemplate`

Identidade estável do template.

```text
id UUID
organizationId String
code, name, category, description
status
createdByMembershipId
createdAt, updatedAt
```

Unicidade: `organizationId + code`.

#### `ChecklistTemplateVersion`

Conteúdo versionado.

```text
id UUID
templateId UUID
version Int
status DRAFT | PUBLISHED | RETIRED
approvalRequired Boolean
passingScore Decimal
scoringAlgorithmVersion Int
sourceVersionId UUID?
createdByMembershipId
publishedByMembershipId?
createdAt, publishedAt?, retiredAt?
```

Unicidade: `templateId + version`; no máximo um DRAFT por template. Conteúdo publicado é imutável.

#### `ChecklistTemplateSection`

```text
id UUID
templateVersionId UUID
stableKey String
title, description
position Int
```

#### `ChecklistTemplateItem`

```text
id UUID
templateVersionId UUID
sectionId UUID
stableKey String
title, instructions
position Int
responseType BOOLEAN | CHOICE | NUMBER | TEXT
required, allowNotApplicable, critical
evidenceRequired
maxPoints Decimal
answerConfigJson, scoringConfigJson
```

`stableKey` permite comparar o mesmo conceito entre versões sem reaproveitar IDs mutáveis.

### 8.2 Execução e atribuição manual

#### `ChecklistRun`

Ocorrência concreta e idempotente.

```text
id UUID
clientRequestId UUID
organizationId String
establishmentId UUID
templateVersionId UUID
assignedMembershipId UUID
createdByMembershipId UUID
dueAt
status ASSIGNED | IN_PROGRESS | SUBMITTED | APPROVED | REJECTED | CANCELLED
version
createdAt, updatedAt, completedAt?
```

`clientRequestId` é único por organização e torna retries de criação idempotentes. Uma constraint/trigger deverá confirmar que `organizationId` coincide com a organização do estabelecimento e que criador e responsável pertencem à unidade.

#### `ChecklistRunAssignment`

Histórico append-only de atribuição e reatribuição.

```text
id UUID
runId UUID
sequence Int
previousMembershipId UUID?
assignedMembershipId UUID
changedByMembershipId UUID
changeType INITIAL | REASSIGNMENT
reason String?
createdAt
```

A criação registra `INITIAL`; toda `REASSIGNMENT` exige `reason` não vazio. Unicidade: `runId + sequence`. O registro não admite `UPDATE` ou `DELETE`.

#### `ChecklistExecutionAttempt`

```text
id UUID
runId UUID
attemptNumber Int
executorMembershipId UUID
status IN_PROGRESS | SUBMITTED | APPROVED | REJECTED
score, earnedPoints, applicablePoints
isCompliant, criticalFailure
version
startedAt, submittedAt?, decidedAt?
```

Unicidade: `runId + attemptNumber`.

#### `ChecklistResponse`

```text
id UUID
attemptId UUID
templateItemId UUID
valueJson
outcome PASS | FAIL | NOT_APPLICABLE | UNASSESSED
note
earnedPoints, maxPointsSnapshot
answeredByMembershipId
answeredAt, updatedAt
version
```

Unicidade: `attemptId + templateItemId`.

#### `ChecklistEvidence`

Metadados da evidência; o binário não fica no PostgreSQL.

```text
id UUID
responseId UUID
storageProvider, objectKey
sha256, contentType, byteSize
width?, height?
capturedAt?, uploadedAt
uploadedByMembershipId
status PENDING | AVAILABLE | QUARANTINED | DELETED
```

#### `ChecklistApproval`

Decisão append-only.

```text
id UUID
attemptId UUID
decision APPROVE | REJECT
reason?
approverMembershipId UUID
createdAt
```

Rejeição exige motivo. Executor e aprovador devem ser diferentes.

#### `ChecklistRunEvent`

Timeline operacional append-only.

```text
id UUID
runId UUID
sequence Int
eventType
actorMembershipId UUID?
metadataJson?
occurredAt
```

Unicidade: `runId + sequence`. Eventos não admitem `UPDATE` ou `DELETE`.

### 8.3 Relações e deleção

- todas as FKs de histórico usam `onDelete: Restrict`;
- templates são retirados, não apagados quando referenciados;
- evidência pode ter retenção expirada, mas seu checksum e evento permanecem;
- membership inativo continua referenciável no histórico;
- nenhum `Cascade` deve remover execução, resposta, evidência, aprovação ou evento.

## 9. Versionamento de templates

1. `ChecklistTemplate` é a identidade estável;
2. somente versão DRAFT pode ser editada;
3. publicar ocorre em transação e valida a estrutura completa;
4. versões PUBLISHED/RETIRED, seções e itens ficam imutáveis por trigger;
5. editar template publicado significa clonar para versão N+1 DRAFT;
6. uma ocorrência fixa `templateVersionId` na criação;
7. publicar N+1 não altera ocorrências abertas da versão N;
8. retirar versão impede novas ocorrências, sem apagar histórico;
9. comparações de relatório usam `stableKey` e mostram a versão;
10. não haverá edição “rápida” de item publicado.

## 10. Evidências fotográficas

### 10.1 Arquitetura

- binários em storage privado; apenas metadados e checksum no PostgreSQL;
- object key opaco, sem e-mail, nome do usuário ou filename original;
- upload autorizado por ocorrência/resposta e membership;
- leitura por URL curta assinada ou endpoint autenticado;
- validação por magic bytes, não apenas `Content-Type` do cliente;
- formatos iniciais: JPEG, PNG e WebP;
- limite sugerido: 10 MB por imagem, quantidade configurável por item;
- remoção de EXIF, especialmente geolocalização;
- checksum SHA-256 e leitura de confirmação;
- retenção e exclusão conforme política aprovada.

### 10.2 Consistência

PostgreSQL e storage não compartilham transação. O fluxo deverá usar estado `PENDING`, upload idempotente, confirmação de checksum e compensação de órfãos. Uma evidência não confirmada nunca satisfaz um item obrigatório.

### 10.3 Gates pendentes

- escolha do provider de produção;
- retenção jurídica e operacional;
- política de malware scanning;
- limites por organização/plano;
- custo, observabilidade e backup.

Para desenvolvimento, usar adapter de filesystem em diretório temporário fora do repositório e fake em memória nos testes. Nenhum serviço remoto será acessado sem autorização.

## 11. Criação pontual e reatribuição

O MVP não precisa de scheduler, queue, turno ou recorrência. Toda ocorrência nasce de uma ação explícita de usuário autorizado.

Regras:

1. criação exige template publicado, prazo futuro e responsável elegível;
2. o backend recebe `clientRequestId` e devolve a ocorrência existente quando o mesmo pedido é repetido com payload idêntico;
3. o mesmo `clientRequestId` com payload diferente retorna conflito;
4. o responsável precisa estar ativo na unidade e ter `checklists.execute` efetiva;
5. reatribuição exige `checklists.runs.manage`, optimistic locking e justificativa;
6. ocorrência concluída ou cancelada não pode ser reatribuída;
7. reatribuição preserva executor de tentativas anteriores e registra evento append-only;
8. datas são armazenadas em UTC e exibidas no timezone do estabelecimento.

## 12. APIs propostas

Todas sob `/api/checklists`, autenticadas e protegidas por capability.

Rotas de template usam `checklists.templates.manage`; listagem de elegíveis, criação e reatribuição usam `checklists.runs.manage`; início/respostas/submissão usam `checklists.execute`; aprovação/rejeição usam `checklists.approve`.

### Catálogo e atribuição

```text
GET/POST/PATCH   /templates
POST             /templates/:id/versions
GET/PATCH        /template-versions/:id
POST             /template-versions/:id/publish
POST             /template-versions/:id/retire
GET              /eligible-assignees
POST             /runs
PATCH            /runs/:id/assignment
```

### Execução e aprovação

```text
GET              /runs
GET              /runs/:id
POST             /runs/:id/start
PUT              /attempts/:id/responses/:itemId
POST             /responses/:id/evidences
POST             /attempts/:id/submit
POST             /attempts/:id/approve
POST             /attempts/:id/reject
GET              /runs/:id/history
GET              /reports
```

Comandos mutáveis recebem chave idempotente quando aplicável e `version` para optimistic locking. Listagens têm paginação, período máximo e escopo de estabelecimento derivado do token.

## 13. Impacto no frontend e design system

### 13.1 Área de checklists

Rotas propostas:

```text
/checklists                 fila do usuário e visão do dia
/checklists/:runId          execução da ocorrência
/checklists/approvals       fila de aprovação
/checklists/templates       catálogo e versões
/checklists/reports         indicadores e histórico
```

### 13.2 Experiência

- ação “Nova execução” para escolher template publicado, prazo e responsável;
- seletor de responsável mostra apenas funcionários elegíveis da unidade e informa quando a lista estiver vazia;
- reatribuição usa modal com responsável atual, novo responsável e justificativa obrigatória;
- execução mobile-first com controles grandes, progresso e salvamento visível;
- captura de foto acessível com preview, remoção e estado de upload;
- template builder em desktop com seções reordenáveis e preview;
- status consistentes: atribuído, em andamento, enviado, aprovado, rejeitado, atrasado e cancelado;
- detalhes distinguem claramente criador, responsável atual e executor de cada tentativa;
- aprovação apresenta item, resposta e evidência lado a lado;
- rejeição explica motivo e próxima ação;
- relatórios sempre exibem filtros e versão do template;
- telas de 403, vazio, carregamento e erro reutilizam componentes atuais;
- navegação por teclado, labels, foco de modal e contraste devem entrar nos critérios.

### 13.3 Dependência de autorização visual

Antes de expor a área, o frontend precisa conhecer as capacidades efetivas do usuário. A proposta é adicionar, em entrega autorizada futura, um endpoint de contexto como `GET /api/auth/capabilities`, alimentado pelo resolvedor B2 já existente. Isso não altera perfis nem regras; apenas expõe ao cliente a decisão vigente.

O backend continua sendo a autoridade. Ocultar botão ou rota é experiência, não controle de segurança.

## 14. Proposta de migrations

Nenhuma migration foi criada. Como existem 60 migrations hoje, qualquer primeira migration nova será tecnicamente a próxima do repositório e requer aprovação explícita — inclusive para resolver a concorrência nominal com a migration 61 anteriormente discutida para o primeiro OWNER.

Recomendam-se duas migrations aditivas:

### Migration A — catálogo e versionamento

- enums de template e resposta;
- templates, versões, seções e itens;
- checks, índices e triggers de imutabilidade;
- relações Prisma reversas estritamente necessárias.

### Migration B — execução, atribuição, evidência e aprovação

- ocorrências pontuais e histórico de atribuições;
- tentativas, respostas, evidências, aprovações e eventos;
- constraints de tenant, elegibilidade e unicidade idempotente;
- checks de estado e pontuação;
- triggers append-only;
- índices por estabelecimento, responsável, status, prazo, histórico e relatório.

Regras comuns:

- somente estruturas novas e FKs `Restrict`;
- nenhum backfill ou dado operacional;
- nenhuma alteração nas migrations existentes;
- replay desde banco vazio e upgrade 1–60 + novas migrations;
- cada etapa reversível por rollback de aplicação; dados históricos nunca removidos automaticamente;
- Prisma Migrate real deve ser exercitado em PostgreSQL descartável quando o engine estiver disponível;
- nomes/timestamps só serão definidos após aprovação e verificação da sequência vigente.

## 15. Plano incremental de implementação

### Entrega 0 — PRD e contratos

Este documento. Critério: aprovação explícita das regras, estados, modelo, autorização e recorte MVP.

### Entrega 1 — Fundação do domínio

Escopo: capacidade `checklists.runs.manage`, composição explícita dos perfis, Migration A, models Prisma, enums, validadores e contratos de estado.  
Testes: catálogo/perfis/overrides, OWNER negado para distribuição, replay/upgrade, constraints, imutabilidade, tenant e unitários de scoring.  
Demonstração: diagrama/schema e testes PostgreSQL; nenhuma tela pública.

### Entrega 2 — Templates e publicação

Escopo: APIs e UI de templates, seções, itens, preview, clone e publicação.  
Testes: capabilities, LEGACY/PROFILED, cross-tenant, publicação concorrente, versões imutáveis.  
Demonstração: criar DRAFT, visualizar, publicar e gerar N+1.

### Entrega 3 — Criação e atribuição manual

Escopo: núcleo da Migration B, criação pontual, seleção de responsável, prazo, reatribuição e histórico.  
Testes: responsável inativo/sem capacidade, cross-unit, idempotência, justificativa, optimistic locking e concorrência.  
Demonstração: gestor cria uma ocorrência, atribui um funcionário e realiza reatribuição justificada.

### Entrega 4 — Execução e fotos

Escopo: tentativa, fila do responsável, respostas, adapter local de evidência e tela mobile.  
Testes: save/retry, optimistic locking, validação de arquivo, checksum, isolamento e expiração de acesso.  
Demonstração: COLLABORATOR executa checklist atribuído com foto fictícia.

### Entrega 5 — Aprovação, histórico e pontuação

Escopo: aprovação/eventos da Migration B, cálculo final, retrabalho e timeline.  
Testes: autoaprovação, aprovar/rejeitar concorrente, item crítico, N/A, tentativa imutável e auditoria.  
Demonstração: SUPERVISOR rejeita, executor refaz e aprovador distinto encerra.

### Entrega 6 — Relatórios e validação dos seis perfis

Escopo: consultas agregadas, filtros, exportação futura não incluída, navegação capability-aware.  
Testes: perfil/override, 401/403, tenant/unidade, período, versão, paginação e desempenho.  
Demonstração: desktop/mobile com os seis perfis no laboratório PROFILED e validação LEGACY separada.

Cada entrega exige allowlist própria, testes completos afetados e autorização antes de seguir. Nenhuma entrega inicia automaticamente a seguinte.

## 16. Estratégia de testes

### Unitários

- máquina de estados;
- scoring, N/A e item crítico;
- idempotência da criação pontual;
- elegibilidade e reatribuição do responsável;
- canonicalização/checksum de evidência;
- política de versão e publicação.

### PostgreSQL real descartável

- constraints e triggers;
- consistência organização/estabelecimento/membership;
- publicação e submissão concorrentes;
- criação duplicada por retry;
- reatribuição concorrente;
- aprovação versus rejeição;
- sequência append-only;
- isolamento cross-tenant;
- locks e retries.

### HTTP e autorização

- seis perfis B2;
- `checklists.runs.manage` presente apenas em ADMINISTRATOR/MANAGER;
- OWNER, SUPERVISOR, COLLABORATOR e AUDITOR impedidos de criar/atribuir/reatribuir;
- `ALLOW` incapaz de conceder a capacidade indelegável e `DENY` capaz de removê-la;
- LEGACY e PROFILED em processos isolados;
- `ALLOW`, `DENY` e `DENY` prevalecendo;
- 401 sem identidade e 403 sem capacidade/escopo;
- autoaprovação e reatribuição indevida;
- unidade e organização vizinhas;
- configuração PROFILED ausente falhando fechada;
- kill switch retornando à política LEGACY.

### Frontend e navegador

- componentes, formulários, estados e erros;
- upload/câmera e retry;
- execução desktop e mobile;
- acessibilidade básica automatizada e manual;
- refresh/deep links;
- comparação entre controles visíveis e resultado HTTP;
- nenhuma aprovação baseada apenas em teste visual.

### Regressão

- suíte backend completa;
- suíte frontend completa;
- inventário de rotas/capacidades;
- usuários/permissões, OWNER normal e limite organizacional;
- nenhuma ativação PROFILED fora da fixture;
- migrations históricas preservadas.

## 17. Riscos e mitigação

| Severidade | Risco | Mitigação proposta |
|---|---|---|
| Crítica | vazamento entre tenants/unidades | membership como identidade local, filtros compostos, constraints e testes cross-tenant |
| Crítica | reatribuição virar elevação de privilégio | reatribuição não concede capability; revalidar responsável em cada ação |
| Alta | OWNER herdar automaticamente nova capacidade | exclusão explícita na composição do perfil e teste contratual |
| Alta | template mudar histórico | versão publicada imutável e ocorrência fixada à versão |
| Alta | foto expor PII ou localização | storage privado, EXIF removido, URLs curtas, retenção e acesso auditado |
| Alta | inconsistência entre PostgreSQL e storage | estado pendente, checksum, idempotência e compensação de órfãos |
| Alta | frontend mostrar autorização errada | contexto de capabilities e backend como autoridade final |
| Alta | retry criar ocorrência duplicada | `clientRequestId`, payload consistente e índice único por organização |
| Alta | relatório comparar versões incompatíveis | filtros/agrupamento por versão e `stableKey` explícito |
| Média | perfil AUDITOR sem acesso | decisão separada para capacidade read-only; não ampliar silenciosamente |
| Média | conectividade móvel instável | saves pequenos e idempotentes; offline completo fora do MVP |
| Média | volume de eventos/fotos | paginação, índices, retenção e quotas futuras |
| Média | migration ampla | duas migrations aditivas e validação incremental |

## 18. Critérios de aceite do MVP

### Produto

- gestor cria e publica template versionado;
- publicação torna conteúdo imutável;
- gestor cria uma ocorrência pontual idempotente com prazo;
- responsável inicial e reatribuições justificadas ficam rastreados;
- executor autorizado responde e anexa foto;
- campos/evidências obrigatórios bloqueiam submissão incompleta;
- backend calcula e congela a pontuação;
- aprovador distinto aprova ou rejeita com histórico;
- rejeição permite nova tentativa sem alterar a anterior;
- relatórios filtram unidade, período, template/versão e responsável.

### Segurança

- nenhuma consulta ou mutação cross-tenant/cross-unit é aceita;
- toda rota possui capability e fallback LEGACY inventariados;
- somente ADMINISTRATOR/MANAGER em PROFILED e ADMIN/MANAGER em LEGACY distribuem ocorrências;
- autoridade OWNER não ignora essa restrição;
- usuário sem atribuição não executa ocorrência;
- atribuição/reatribuição não concede permissão;
- executor não autoaprova;
- fotos não possuem URL pública permanente;
- eventos e decisões submetidas são append-only;
- nenhum ID do body substitui o tenant autenticado.

### Qualidade

- migrations reproduzidas por Prisma Migrate em PostgreSQL descartável;
- testes unitários, HTTP, PostgreSQL e navegador aprovados;
- concorrência e retries exercitados;
- desktop e mobile demonstrados;
- acessibilidade básica aprovada;
- nenhuma regressão nas suítes existentes;
- documentação de operação, retenção e recuperação entregue.

## 19. Decisões firmes e autorizações pendentes

Decisões de produto já firmes:

- somente ADMINISTRATOR/MANAGER em PROFILED e ADMIN/MANAGER em LEGACY distribuem execuções;
- OWNER não possui bypass para criação, atribuição ou reatribuição;
- SUPERVISOR executa e aprova, mas não distribui;
- COLLABORATOR executa somente o que estiver atribuído a ele;
- executor nunca aprova a própria tentativa;
- atribuição do MVP é exclusivamente manual.

Pontos ainda pendentes antes das respectivas entregas:

1. confirmar se `AUDITOR` deve consultar histórico/relatórios e, se sim, autorizar nova capacidade somente-leitura;
2. aprovar tipos de resposta iniciais e fórmula de pontuação;
3. aprovar política de retrabalho por nova tentativa;
4. definir retenção de fotos e histórico;
5. escolher provider de storage apenas antes do gate de produção;
6. aprovar as duas migrations incrementais e resolver a próxima sequência após as 60 atuais;
7. aprovar o endpoint de capabilities para o frontend;
8. autorizar, na implementação, a inclusão indelegável de `checklists.runs.manage` somente em ADMINISTRATOR/MANAGER;
9. confirmar o mapeamento LEGACY de `STAFF` e `STOCK_COUNTER` para execução atribuída.

## 20. GO/NO-GO

### GO proposto após aprovação do PRD

- iniciar somente a Entrega 1 com allowlist específica;
- manter o domínio aditivo e isolado;
- reutilizar as três capacidades B2 atuais e adicionar `checklists.runs.manage` somente após autorização de implementação;
- usar `UserEstablishment` em todas as identidades operacionais;
- manter templates publicados e histórico imutáveis;
- desenvolver e testar apenas com PostgreSQL e arquivos locais descartáveis até autorização posterior.

### NO-GO atual

- modificar schema ou criar qualquer migration;
- criar a migration 61 sem aprovação explícita;
- alterar perfis, catálogo B2, PROFILED ou kill switch;
- implementar rotas, serviços, páginas, worker ou storage;
- acessar serviço remoto ou banco de produção;
- staging, commit, push, merge ou deploy;
- iniciar automaticamente qualquer entrega.

B2.21 concluída como proposta de produto e arquitetura. A implementação permanece aguardando aprovação explícita deste PRD e das decisões da seção 19.
