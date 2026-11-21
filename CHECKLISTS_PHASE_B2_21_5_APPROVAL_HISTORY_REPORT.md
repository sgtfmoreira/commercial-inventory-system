# BASTIDOR OS — B2.21.5: aprovação, retrabalho e histórico de checklists

> Data de conclusão: 21 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> HEAD/base preservado: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **Entrega 5 implementada e validada localmente; nenhum storage remoto, commit, push, merge, deploy ou acesso à produção executado**

## 1. Resultado executivo

A Entrega 5 concluiu o ciclo de decisão e retrabalho do checklist:

- fila de tentativas submetidas limitada à organização e ao estabelecimento ativos;
- leitura de respostas, pontuação e evidências pelo aprovador autorizado;
- bloqueio de autoaprovação no serviço e no PostgreSQL;
- aprovação e rejeição transacionais com optimistic locking;
- justificativa obrigatória para rejeição;
- decisão append-only, vinculada ao membership do aprovador;
- rejeição que preserva a tentativa anterior e habilita uma nova tentativa numerada;
- aprovação que encerra a ocorrência sem reescrever score ou respostas;
- conclusão automática de templates que não exigem aprovação;
- timeline protegida com atribuições, tentativas, decisões e eventos;
- espelho de aprovação/rejeição em `SecurityAuditEvent`;
- interface React para fila, revisão, evidências, aprovação e rejeição;
- estado final imutável na tela do executor e ação explícita de retrabalho.

Resultados finais:

```text
Prisma schema:                    válido
migrations em replay vazio:       64/64
HTTP + PostgreSQL da Entrega 5:    1/1
backend completo:                299/299 (10 integrações condicionais ignoradas)
frontend completo:                62/62
gates de encoding e UI:           aprovados
build frontend:                   aprovado com avisos legados fora do checklist
```

Decisão: **Entrega 5 concluída localmente. GO técnico para preparar a Entrega 6 em gate separado. NO-GO para relatórios, capacidade de auditor somente leitura, storage remoto, staging, produção ou publicação automática.**

## 2. Migration 64 e persistência

Migration criada:

```text
20261120223000_add_checklist_approvals
```

SHA-256:

```text
53d785fa2e4e214ea2998bc0c7b644b96fccfc85a505f43f26cbe9e98392024e
```

Estruturas e contratos adicionados:

- enum `ChecklistApprovalDecision` com `APPROVE` e `REJECT`;
- tabela `checklist_approvals` com uma decisão única por tentativa;
- motivo de rejeição com pelo menos três caracteres;
- FKs históricas com `ON DELETE RESTRICT`;
- eventos `ATTEMPT_APPROVED`, `ATTEMPT_REJECTED` e `ATTEMPT_AUTO_APPROVED`;
- transições permitidas `SUBMITTED → APPROVED | REJECTED`;
- congelamento de score, pontos, conformidade e instante de submissão durante a decisão;
- guard de unidade ativa, membership ativo, aprovação exigida e separação executor/aprovador;
- trigger que impede `UPDATE` ou `DELETE` de decisões.

O replay desde banco vazio aplicou as 64 migrations e terminou com `Database schema is up to date`. O upgrade da base descartável com as 63 migrations anteriores também foi validado.

## 3. Contrato HTTP entregue

Rotas autenticadas sob `/api/checklists`:

| Método | Rota | Regra |
|---|---|---|
| GET | `/approvals` | `checklists.approve`, mesma organização/unidade e executor distinto |
| GET | `/approval-attempts/:attemptId` | revisão escopada da tentativa |
| POST | `/attempts/:attemptId/approve` | tentativa submetida e versão observada |
| POST | `/attempts/:attemptId/reject` | mesma regra, com justificativa obrigatória |
| GET | `/approval-evidences/:evidenceId/content` | evidência privada, autenticada e escopada |
| GET | `/runs/:runId/history` | timeline protegida por `checklists.approve` |

O fallback LEGACY de aprovação permanece limitado a `ADMIN` e `MANAGER`. No modo PROFILED, a decisão usa `checklists.approve` e reavalia overrides em cada requisição. O inventário contratual passou a cobrir 27 rotas do domínio de checklists.

## 4. Decisão, concorrência e retrabalho

- a versão da tentativa é obrigatória em toda decisão;
- duas decisões concorrentes produzem uma resposta 200, uma resposta 409 e apenas uma linha de aprovação;
- executor e aprovador precisam ser memberships distintos da mesma unidade ativa;
- rejeição exige motivo e muda tentativa e ocorrência para `REJECTED` na mesma transação;
- uma ocorrência rejeitada pode iniciar a tentativa N+1;
- a tentativa rejeitada permanece congelada e consultável no histórico;
- aprovação muda tentativa e ocorrência para `APPROVED` e registra `completedAt`;
- decisão repetida ou tardia retorna conflito;
- falha transacional não deixa aprovação, status ou evento parcial;
- templates com `approvalRequired=false` transitam de submissão para aprovação automática, sem fabricar um aprovador humano.

## 5. Histórico e auditoria

O endpoint de histórico devolve:

- identidade e status atuais da ocorrência;
- template e versão utilizados;
- atribuição inicial e reatribuições justificadas;
- todas as tentativas em ordem numérica;
- executor, respostas, evidências, score e decisão de cada tentativa;
- eventos operacionais sequenciais com ator e timestamp.

Cada decisão humana também cria `CHECKLIST_ATTEMPT_APPROVED` ou `CHECKLIST_ATTEMPT_REJECTED` em `SecurityAuditEvent`, com ator, alvo, estado anterior/posterior, ocorrência e motivo. A linha de `ChecklistApproval` e os eventos operacionais são append-only.

## 6. Interface entregue

Nova rota React:

```text
/checklists/approvals
```

A entrada de navegação aparece somente quando a capability efetiva `checklists.approve` está presente. A tela oferece:

- fila de tentativas submetidas por outros executores;
- identificação de modelo, versão, tentativa, executor e resultado;
- revisão item a item de resposta, observação e resultado;
- carregamento autenticado das fotos como blobs temporários;
- destaque de falhas e falhas críticas;
- aprovação direta;
- rejeição bloqueada enquanto a justificativa estiver vazia;
- liberação dos object URLs ao fechar ou desmontar a tela.

Na fila do executor, uma ocorrência rejeitada apresenta `Refazer` e inicia a tentativa seguinte. Telas `SUBMITTED`, `APPROVED` e `REJECTED` exibem resumo imutável, sem controles de edição.

## 7. Evidências de validação

Foram exercitados:

- schema e geração do Prisma Client;
- upgrade 63 → 64 e replay 1 → 64 em PostgreSQL descartável;
- fila de aprovação e leitura autenticada de evidência;
- bloqueio de autoaprovação pela API;
- rejeição justificada e nova tentativa numerada;
- aprovação posterior sem alteração da tentativa rejeitada;
- disputa concorrente entre aprovar e rejeitar;
- decisão append-only e auditoria de segurança;
- aprovação automática quando configurada no template;
- timeline com duas tentativas e eventos de rejeição/aprovação;
- inventário das 27 rotas do domínio;
- navegação por capability e estados finais do executor;
- suíte backend completa, suíte frontend completa, gates de texto/UI e build otimizado.

O build manteve avisos ESLint já existentes em páginas fora do domínio de checklists e o aviso de tamanho do bundle. Nenhum aviso novo da Entrega 5 permaneceu.

## 8. Fora do escopo e próximo gate

Permanecem fora desta entrega:

- relatórios agregados e filtros analíticos;
- capacidade somente leitura para `AUDITOR`;
- exportação de relatórios;
- provider remoto e URLs assinadas;
- retenção, quotas, malware scanning e backup;
- offline completo;
- recorrência, scheduler, turnos e atribuição automática.

A Entrega 6 deverá adicionar consultas agregadas, filtros por período/unidade/template/versão/responsável e validação final dos seis perfis. A eventual leitura do perfil `AUDITOR` continua dependendo de decisão contratual específica e não foi ampliada silenciosamente.
