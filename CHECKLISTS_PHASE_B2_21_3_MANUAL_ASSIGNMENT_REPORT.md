# BASTIDOR OS — B2.21.3: criação e atribuição manual de checklists

> Data de conclusão: 20 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> HEAD/base preservado: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **Entrega 3 implementada e validada localmente; nenhuma publicação, ativação remota, commit, push, merge ou deploy executado**

## 1. Resultado executivo

A Entrega 3 concluiu o núcleo de distribuição manual do módulo de checklists:

- criação pontual de ocorrência a partir de uma versão publicada;
- prazo futuro e responsável selecionado manualmente;
- elegibilidade derivada de membership ativo na unidade e `checklists.execute` efetiva;
- autorização de distribuição por `checklists.runs.manage`;
- fallback LEGACY limitado a `ADMIN` e `MANAGER`;
- idempotência por `organizationId + clientRequestId` e fingerprint canônico;
- repetição simultânea do mesmo pedido devolvendo a mesma ocorrência;
- reatribuição somente por gestor autorizado, com justificativa e optimistic locking;
- histórico de atribuição e eventos append-only;
- isolamento por organização e estabelecimento derivados da sessão;
- interface React para criar, listar e reatribuir ocorrências;
- navegação visível apenas com a capability efetiva.

Resultados finais:

```text
Prisma schema:                   válido
migrations em replay vazio:      62/62
HTTP + PostgreSQL da Entrega 3:   1/1
backend completo:               297/297 (8 integrações condicionais ignoradas)
frontend completo:               55/55
build frontend:                  aprovado
```

Decisão: **Entrega 3 concluída. GO técnico para preparar a Entrega 4 em autorização separada. NO-GO para iniciar fotos, execução, staging, produção ou publicação automaticamente.**

## 2. Migration 62 e modelo persistente

Migration criada:

```text
20261118014500_add_checklist_runs
```

SHA-256:

```text
c48a52075d91ee46d9f4d97ecc4cd89feb49f731e65d18d51bff3511e3962863
```

Estruturas adicionadas:

- `ChecklistRun`;
- `ChecklistRunAssignment`;
- `ChecklistRunEvent`;
- enums de estado, tipo de atribuição e tipo de evento;
- índices para unidade/status/prazo, responsável e versão do template;
- unicidade de `organizationId + clientRequestId`;
- FKs históricas com `ON DELETE RESTRICT`;
- guards de tenant, unidade, template publicado e memberships ativos;
- triggers append-only para atribuições e eventos.

O campo `requestFingerprint` foi incluído para distinguir retry idêntico de reutilização conflitante da mesma chave idempotente.

Esta migration implementa somente o núcleo de ocorrências e atribuições da Migration B proposta. Tentativas, respostas, evidências e aprovações permanecem para migrations aditivas posteriores.

## 3. Contrato HTTP entregue

Rotas autenticadas sob `/api/checklists`:

| Método | Rota | Capability |
|---|---|---|
| GET | `/capabilities` | contexto autenticado |
| GET | `/published-templates` | `checklists.runs.manage` |
| GET | `/eligible-assignees` | `checklists.runs.manage` |
| GET | `/runs` | `checklists.runs.manage` |
| POST | `/runs` | `checklists.runs.manage` |
| GET | `/runs/:runId` | `checklists.runs.manage` |
| PATCH | `/runs/:runId/assignment` | `checklists.runs.manage` |

O cliente não pode fornecer organização, estabelecimento ou membership do ator como autoridade. Esses valores vêm exclusivamente da sessão autenticada.

## 4. Idempotência e concorrência

Na criação:

1. o backend canonicaliza versão, responsável e prazo UTC;
2. calcula SHA-256 do pedido;
3. procura `organizationId + clientRequestId`;
4. retry com fingerprint igual devolve a ocorrência existente;
5. chave igual com payload diferente devolve 409;
6. colisão concorrente de unicidade é reconciliada após o commit vencedor.

Na reatribuição:

- o cliente envia a versão observada da ocorrência;
- a atualização condiciona `id + version + status`;
- somente uma alteração concorrente vence;
- a outra recebe 409;
- o novo responsável é revalidado no momento da alteração;
- responsável anterior, novo responsável, ator, motivo e timestamp ficam preservados.

Durante a validação final foi corrigida a reconciliação do `P2002` concorrente: duas criações simultâneas idênticas agora retornam a mesma ocorrência, em vez de transformar o segundo retry em conflito.

## 5. Interface entregue

Rota React:

```text
/checklists
```

Funcionalidades:

- lista de ocorrências da unidade;
- identificação do modelo e versão;
- responsável atual, criador, prazo e estado;
- modal “Nova execução”;
- seleção apenas de versões publicadas;
- seleção apenas de responsáveis elegíveis;
- geração de `clientRequestId` no cliente;
- conversão do prazo local para UTC;
- modal de reatribuição com justificativa obrigatória;
- exibição do histórico de reatribuições;
- estados vazios para ausência de modelo ou responsável;
- entrada de navegação condicionada a `checklists.runs.manage`.

O backend permanece a autoridade final; a visibilidade da navegação não substitui autorização HTTP.

## 6. Segurança comprovada

- 401 sem identidade;
- 403 sem `checklists.runs.manage`;
- LEGACY limitado a `ADMIN`/`MANAGER`;
- PROFILED OWNER sem bypass de distribuição;
- responsável sem `checklists.execute` excluído da lista e rejeitado na mutação;
- membership inativo ou de outra unidade rejeitado;
- template não publicado ou de outra organização rejeitado;
- consulta de ocorrência de tenant vizinho retorna 404;
- histórico não aceita `UPDATE` ou `DELETE`;
- `DENY` continua prevalecendo e `ALLOW` não concede a capability indelegável.

## 7. Validação executada

### Prisma e migrations

- `prisma validate`: aprovado;
- banco de upgrade `bastidor_b2213_runs`: 62 migrations e status limpo;
- replay vazio `bastidor_b2213_replay_20261120`: 62/62 aplicadas;
- nenhum backfill ou acesso a banco remoto.

### HTTP + PostgreSQL real

O teste `checklistRunHttpPostgres.test.js` aprovou:

- autenticação e matriz LEGACY;
- lista de elegíveis;
- idempotência sequencial e concorrente;
- conflito de payload;
- isolamento cross-unit/cross-tenant;
- reatribuição concorrente;
- histórico append-only;
- OWNER PROFILED impedido de distribuir.

### Regressão backend

```text
tests:    305
pass:     297
fail:       0
skipped:    8
```

Os oito testes ignorados são integrações PostgreSQL condicionadas a variáveis próprias. O teste PostgreSQL específico da Entrega 3 foi executado separadamente e aprovado.

### Frontend

```text
suites: 11/11
tests:  55/55
build:  aprovado
```

O build manteve apenas o aviso preexistente de bundle principal acima da recomendação. A suíte também preservou o warning conhecido de `Modal.maxWidth`, fora da allowlist funcional desta entrega.

## 8. Arquivos funcionais da Entrega 3

### Backend

```text
backend/prisma/schema.prisma
backend/prisma/migrations/20261118014500_add_checklist_runs/migration.sql
backend/src/controllers/checklistRunController.js
backend/src/repositories/checklistRunRepository.js
backend/src/services/checklistRunService.js
backend/src/validations/checklistRunValidation.js
backend/src/routes/checklistTemplateRoutes.js
backend/test/checklistRunService.test.js
backend/test/checklistRunHttpPostgres.test.js
backend/test/checklistTemplateApi.test.js
```

### Frontend

```text
src/App.js
src/components/SidebarLayout.js
src/components/SidebarLayout.test.js
src/pages/ChecklistRuns.js
src/pages/ChecklistRuns.test.js
src/services/checklistRunService.js
```

## 9. Limites preservados

Não fazem parte desta entrega:

- fila pessoal e execução pelo responsável;
- tentativa, respostas e salvamento incremental;
- upload ou armazenamento de fotos;
- cálculo persistido na submissão;
- aprovação, rejeição e retrabalho;
- relatórios;
- acesso somente leitura do AUDITOR;
- storage remoto, staging ou produção.

## 10. Estado final e próximo gate

- staging Git: vazio;
- commit/push/merge/deploy: não executados;
- PROFILED global: não ativado;
- banco remoto: não acessado;
- PostgreSQL usado: somente laboratório local descartável;
- worktree principal: preservado.

A próxima entrega é a B2.21.4: fila “Meus checklists”, início de tentativa, respostas incrementais, submissão e adapter local de evidências. Ela exige uma nova allowlist, nova migration aditiva e decisões explícitas sobre retenção e tratamento das imagens antes de qualquer provider de produção.
