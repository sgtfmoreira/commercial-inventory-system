# Auditoria da implementação — Eventos Fase 01

**Data da auditoria:** 06/10/2026
**Escopo:** implementação comercial de clientes, eventos, orçamentos, precificação, proposta, revisões e aprovação.
**Método:** inspeção estática do schema, migration, backend, frontend, testes e documentação; execução das suítes automatizadas e validação do schema Prisma. Nenhum código funcional foi alterado.

## 1. Resumo executivo

A Fase 01 está funcionalmente implementada para homologação controlada. O núcleo de domínio — persistência, cálculo decimal, isolamento por estabelecimento, snapshots, imutabilidade após envio e aprovação única — está presente e tem boa cobertura unitária. O frontend cobre criação, responsável, gestão de cliente, orçamento, proposta, revisões, edição/cancelamento do evento e histórico comercial. Permanecem como gates de produção ampla a validação visual, o piloto e os controles operacionais descritos neste relatório.

**Conclusão resumida:** aproximadamente **88% da Fase 01** está implementada em relação ao plano disponível. O produto está em condição de **homologação/piloto controlado com usuário real**, acompanhado por equipe técnica, mas ainda não deve ser tratado como liberado para uso amplo e desacompanhado antes do smoke HTTP autenticado e da validação visual/responsiva/PDF.

### Limitação documental importante

O arquivo canônico `PRD_EVENTOS_FASE_01.md`, citado no plano, **não está presente no repositório auditado**. A comparação foi feita contra `docs/EVENTS_PHASE_01_IMPLEMENTATION_PLAN.md`, que declara ter sido derivado desse PRD, complementada por `docs/EVENTS_MODULE_ANALYSIS.md`, `docs/EVENTS_PHASE_01_RELEASE.md` e pelo código.

Consequências:

- requisitos citados apenas no PRD original não puderam ser confirmados literalmente;
- referências do plano a “alertas do PRD” e aos critérios “24.5–24.7” foram avaliadas pela implementação e testes existentes, não pelo texto original;
- o percentual é uma estimativa sobre o plano derivado, não uma certificação formal de aderência ao PRD ausente.

## 2. Entidades, enums e migration

### 2.1 Entidades criadas

| Entidade solicitada | Implementação | Tabela | Avaliação |
|---|---|---|---|
| `EventCustomer` | Model Prisma `EventCustomer` | `commercial_event_customers` | Implementado |
| `Event` | Model Prisma `CommercialEvent` | `commercial_events` | Implementado com nome interno deliberadamente diferente para não conflitar com `ConsumptionEvent` e com o `Event` do navegador |
| `EventBudget` | Model Prisma `EventBudget` | `event_budgets` | Implementado |
| `EventBudgetItem` | Model Prisma `EventBudgetItem` | `event_budget_items` | Implementado |

Arquivos principais:

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20261005120000_add_commercial_events_phase_01/migration.sql`

As entidades cobrem tenant, cliente, responsável, data/horário/local, convidados, revisões, snapshots, custos agrupados, precificação, indicadores, validade, auditoria de envio/aprovação e itens de orçamento.

### 2.2 Enums e status

Foram criados seis enums:

| Enum | Valores |
|---|---|
| `CommercialEventStatus` | `DRAFT`, `BUDGETING`, `APPROVED`, `PLANNING_PENDING`, `CANCELLED` |
| `CommercialEventType` | `CORPORATE`, `WEDDING`, `BIRTHDAY`, `GRADUATION`, `GET_TOGETHER`, `CATERING`, `INTERNAL`, `OTHER` |
| `EventBudgetStatus` | `DRAFT`, `SENT`, `APPROVED`, `REJECTED`, `EXPIRED`, `CANCELLED` |
| `EventBudgetItemType` | `RECIPE`, `PRODUCT`, `MANUAL`, `STAFF`, `SERVICE`, `EQUIPMENT`, `TRANSPORT`, `FEE`, `OTHER` |
| `EventBudgetCostGroup` | `MENU`, `STAFF`, `SERVICE`, `EQUIPMENT`, `TRANSPORT`, `FEE`, `OTHER` |
| `EventQuantityMode` | `FIXED`, `PER_GUEST` |

Observações:

- todos os status de orçamento solicitados existem;
- `PLANNING_PENDING` foi preparado, mas não há transição operacional para ele na Fase 01, conforme o próprio plano;
- a criação normal de evento passa imediatamente de `DRAFT` para `BUDGETING` ao criar a revisão inicial.

### 2.3 Migration

Foi criada uma migration aditiva: `20261005120000_add_commercial_events_phase_01`.

Ela cria:

- seis enums;
- quatro tabelas;
- chaves estrangeiras e índices de busca/listagem;
- `UNIQUE (eventId, revision)`;
- índice único parcial `event_budgets_one_approved_per_event`, que impede mais de um orçamento `APPROVED` por evento;
- constraints para convidados, percentuais, custos e quantidade condicional por modo.

Não há `DROP`, `TRUNCATE`, `DELETE` ou `UPDATE` de dados preexistentes na migration. As únicas alterações aos models existentes no schema são relações reversas em estabelecimento/usuário; `Product`, `Recipe`, estoque, compras, vendas e `ConsumptionEvent` não recebem novas colunas operacionais.

O documento de release registra a migration como aplicada no PostgreSQL remoto/Supabase e as 45 migrations como atualizadas. Há, porém, uma pequena inconsistência documental: a seção “Pendências externas” do mesmo arquivo ainda lista a aplicação autorizada da migration e a confirmação de backup/PITR como pendências. Isso deve ser reconciliado antes do aceite final.

Validação executada nesta auditoria: `npx.cmd prisma validate` — **aprovada**.

## 3. Telas implementadas

### 3.1 Cobertura por tela/etapa

| Tela/etapa | Rota/componente | Estado | Observação |
|---|---|---|---|
| Listagem de eventos | `/events` — `src/pages/Events.js` | Implementado | Busca, status, intervalo de datas, paginação, tabela e resumo da revisão atual. |
| Novo evento | `/events/new` — `src/pages/NewEvent.js` | Implementado | Busca, cadastro/edição rápida de cliente, responsável, informações do evento e criação da revisão 1. |
| Informações | `NewEvent.js` e `/events/:id` — `EventDetail.js` | Implementado | Criação, visualização, edição enquanto há rascunho e cancelamento confirmado. |
| Cardápio | Aba no `EventBudgetEditor.js` | Implementado | Itens manuais, produtos e fichas, quantidade fixa/por convidado, segurança e composição informativa. |
| Custos | Aba no `EventBudgetEditor.js` | Implementado | Equipe, serviço, equipamento, transporte, taxa e outros via grupos de custo. |
| Precificação | `EventPricingPanel.js` | Implementado | Margem, encargos, recomendado, negociado, lucro, margem efetiva, CMV e valores por convidado. |
| Resumo | `EventBudgetSummary.js` | Implementado | Totais, checklist, alertas e ações de workflow. |
| Proposta | `/events/:eventId/budgets/:budgetId/proposal` — `EventProposal.js` | Implementado | DTO público, impressão e download PDF. |
| Revisões | `EventDetail.js` e ações no resumo | Implementado | Histórico dedicado mostra revisão, status, valor, autoria, envio, aprovação e links. |
| Aprovação | Ação no `EventBudgetSummary.js` | Implementado | Disponível somente para `SENT`; backend reforça a regra e unicidade. |

### 3.2 Navegação e convivência

- “Eventos” foi incluído na navegação.
- “Eventos de Marketing” foi preservado, sem mudança de rota.
- As rotas novas estão isoladas sob `/events` no frontend e `/api/events` no backend.
- A troca de estabelecimento com editor aberto limpa e recarrega os dados; há teste frontend específico.

### 3.3 Ponto de UX ainda incompleto

- responsividade, teclado, contraste e impressão/PDF ainda não foram auditados visualmente em navegador real.

## 4. Endpoints criados

Todos os endpoints abaixo passam por `authMiddleware` e `requireRole(['ADMIN', 'MANAGER'])`. O tenant é extraído de `req.user.establishmentId`.

### 4.1 Clientes de eventos

| Método | Rota | Controller | Service | HTTP de sucesso | Status |
|---|---|---|---|---:|---|
| GET | `/api/event-customers` | `eventCustomerController.list` | `eventCustomerService.list` | 200 | Implementado |
| POST | `/api/event-customers` | `eventCustomerController.create` | `eventCustomerService.create` | 201 | Implementado |
| GET | `/api/event-customers/:id` | `eventCustomerController.getById` | `eventCustomerService.getById` | 200 | Implementado |
| PATCH | `/api/event-customers/:id` | `eventCustomerController.update` | `eventCustomerService.update` | 200 | Implementado |

### 4.2 Eventos

| Método | Rota | Controller | Service | HTTP de sucesso | Status |
|---|---|---|---|---:|---|
| GET | `/api/events` | `commercialEventController.list` | `commercialEventService.list` | 200 | Implementado |
| POST | `/api/events` | `commercialEventController.create` | `commercialEventService.create` | 201 | Implementado |
| GET | `/api/events/catalog-items` | `commercialEventController.catalog` | `eventCatalogService.list` | 200 | Implementado |
| GET | `/api/events/responsible-users` | `commercialEventController.listResponsibleUsers` | `commercialEventService.listResponsibleUsers` | 200 | Implementado |
| GET | `/api/events/:id` | `commercialEventController.getById` | `commercialEventService.getById` | 200 | Implementado |
| PATCH | `/api/events/:id` | `commercialEventController.update` | `commercialEventService.update` | 200 | Implementado |
| POST | `/api/events/:id/cancel` | `commercialEventController.cancel` | `commercialEventService.cancel` | 200 | Implementado |
| GET | `/api/events/:id/budgets` | `commercialEventController.listBudgets` | `commercialEventService.listBudgets` | 200 | Implementado |

### 4.3 Orçamentos, itens e proposta

| Método | Rota | Controller | Service | HTTP de sucesso | Status |
|---|---|---|---|---:|---|
| GET | `/api/event-budgets/:id` | `eventBudgetController.getById` | `eventBudgetService.getById` | 200 | Implementado |
| PATCH | `/api/event-budgets/:id` | `eventBudgetController.update` | `eventBudgetService.update` | 200 | Implementado |
| POST | `/api/event-budgets/:id/recalculate` | `eventBudgetController.recalculate` | `eventBudgetService.recalculate` | 200 | Implementado |
| POST | `/api/event-budgets/:id/items` | `eventBudgetController.addItem` | `eventBudgetService.addItem` | 201 | Implementado |
| PATCH | `/api/event-budget-items/:id` | `eventBudgetController.updateItem` | `eventBudgetService.updateItem` | 200 | Implementado |
| DELETE | `/api/event-budget-items/:id` | `eventBudgetController.removeItem` | `eventBudgetService.removeItem` | 200 | Implementado |
| POST | `/api/event-budgets/:id/send` | `eventBudgetController.send` | `eventWorkflowService.send` | 200 | Implementado |
| POST | `/api/event-budgets/:id/approve` | `eventBudgetController.approve` | `eventWorkflowService.approve` | 200 | Implementado |
| POST | `/api/event-budgets/:id/reject` | `eventBudgetController.reject` | `eventWorkflowService.reject` | 200 | Implementado |
| POST | `/api/event-budgets/:id/new-revision` | `eventBudgetController.newRevision` | `eventWorkflowService.newRevision` | 201 | Implementado |
| GET | `/api/event-budgets/:id/proposal` | `eventBudgetController.getProposal` | `eventBudgetService.getProposal` | 200 | Implementado |
| GET | `/api/event-budgets/:id/proposal.pdf` | `eventBudgetController.getProposalPdf` | `eventProposalPdfService.generate` | 200/PDF | Implementado |

### 4.4 Diferenças de contrato HTTP

- O plano define validação como HTTP 400. O middleware/controladores atuais usam 422 em parte das validações, especialmente query strings. A validação existe, mas o contrato não é idêntico.
- Não há teste de integração HTTP cobrindo Express, middleware de autenticação, papel, controllers, serialização e status de ponta a ponta; a maior parte da cobertura backend testa services com repositório/Prisma simulados.

## 5. Regras de negócio implementadas

| Regra | Avaliação | Evidência/observação |
|---|---|---|
| Criação de cliente | Sim | CRUD tenant-aware em `eventCustomerService.js`. |
| Criação de evento | Sim | Evento, revisão 1 e auditoria criados na mesma transação; status passa a `BUDGETING`. |
| Criação de orçamento | Sim | Revisão inicial automática e novas revisões por workflow. |
| Itens de cardápio | Sim | Manual, produto e ficha; `costGroup=MENU`; snapshots preservados. |
| Custos adicionais | Sim | Grupos de equipe, serviço, equipamento, transporte, taxa e outros. |
| Cálculo de custo total | Sim | Recalculado no servidor após mutações relevantes. |
| Preço recomendado | Sim | Gross-up com margem e encargos sobre receita; Decimal. |
| Preço negociado/manual | Sim | `quotedPrice`, editável somente em `DRAFT`. |
| Margem efetiva | Sim | Persistida e devolvida pelo backend. |
| CMV do cardápio | Sim | `costMenu / quotedPrice`, com tratamento de ausência de receita. |
| Preço/custo/lucro por convidado | Sim | Persistidos e exibidos. |
| Status completos | Sim | `DRAFT`, `SENT`, `APPROVED`, `REJECTED`, `EXPIRED`, `CANCELLED`. |
| Nova revisão | Sim | Copia itens/premissas com novos IDs, mantém snapshots de custo e limpa snapshots comerciais finais. |
| Bloqueio após envio/aprovação | Sim | Todas as mutações genéricas de orçamento/item exigem `DRAFT`; UI também fica somente leitura. |
| Apenas uma revisão aprovada | Sim | Transação serializável, checagem de aplicação, cancelamento das abertas e índice único parcial no banco. |
| Snapshot do orçamento | Sim | Item congela origem/custo/composição; envio congela cliente e evento; proposta enviada lê snapshot. |

### 5.1 Cálculos

`eventPricingService.js` usa `Prisma.Decimal` como fonte de verdade e implementa:

- quantidade planejada fixa ou por convidado com segurança;
- custo total do item;
- totais por grupo;
- preço recomendado por gross-up;
- encargos sobre preço negociado;
- lucro e margem efetiva;
- CMV de cardápio;
- preço, custo e lucro por convidado;
- alertas de margem abaixo da meta e preço abaixo do ponto de equilíbrio;
- recusa de negativos e de denominador inválido.

### 5.2 Workflow e imutabilidade

- `send`: aceita somente `DRAFT`, recalcula, valida checklist, congela snapshots, marca `SENT` e registra auditoria.
- `reject`: aceita somente `SENT` e registra auditoria.
- `new-revision`: aceita `SENT`, `REJECTED` ou `EXPIRED`, copia premissas/itens e cria novo `DRAFT` relacionado ao pai.
- `approve`: aceita somente `SENT`, executa transação serializável, aprova uma revisão, cancela outras abertas, vincula `approvedBudgetId`, muda o evento para `APPROVED` e registra auditoria.
- `cancel`: é idempotente e cancela revisões abertas.
- `expire`: propostas `SENT` vencidas são marcadas `EXPIRED` ao listar/detalhar; não existe worker agendado.

### 5.3 Ressalvas de domínio

- `eventLifecycleService.js` contém uma matriz de transições testada, mas os services de workflow aplicam várias transições diretamente. Isso cria risco de divergência futura entre a matriz declarada e o comportamento real.
- A expiração é oportunista e acontece em leitura. Uma proposta pode permanecer `SENT` no banco até a próxima consulta, e não há auditoria específica da expiração.
- `newRevision` usa transação serializável e converte conflitos `P2002`/`P2034` em HTTP 409; ainda falta um teste com duas conexões reais simultâneas.
- O banco garante um aprovado por evento, mas não possui constraint que prove que `commercial_events.approvedBudgetId` pertence ao mesmo evento. O service mantém a consistência; uma escrita direta no banco poderia violá-la.
- O snapshot de ficha cobre ingredientes diretos e custos usados; não foi identificada explosão recursiva de subfichas neste módulo. Pelo plano, a composição é informativa na Fase 01, portanto isso não é classificado como bloqueador.

## 6. Compatibilidade com o sistema atual

### 6.1 Módulos existentes

| Verificação | Resultado |
|---|---|
| Alteração perigosa em `Product` | Não identificada; consulta somente leitura para snapshot. |
| Alteração perigosa em `Recipe`/`RecipeItem` | Não identificada; consulta somente leitura. |
| Alteração em `ProductStock`/estoque | Não identificada. |
| Alteração em `PurchaseOrder` | Não identificada. |
| Alteração em `Sale` | Não identificada. |
| Alteração em `ConsumptionEvent` | Não identificada. |
| Movimento/baixa de estoque | Não existe no fluxo de Eventos. |
| Reserva de estoque | Não existe. |
| Geração de compras | Não existe. |
| Colisão com `/api/consumption-events` | Não; rotas, models e tabelas são separados. |

`sourceId` em item é referência de snapshot sem FK para produto/ficha. Isso reduz acoplamento histórico e impede que mudanças ou exclusões no catálogo alterem o orçamento salvo.

### 6.2 Tenant, autenticação e permissões

- O frontend não envia `establishmentId` nos contratos de criação/edição.
- Schemas estritos rejeitam campos desconhecidos, inclusive tentativa de tenant forjado.
- Services e repository filtram cliente, evento, orçamento, item e catálogo por `establishmentId` autenticado.
- Cliente e usuário responsável são validados como pertencentes ao tenant.
- Todas as rotas do módulo exigem autenticação e papel `ADMIN` ou `MANAGER`.
- `STOCK_COUNTER` não tem acesso, conforme a matriz planejada.

Avaliação: **implementado corretamente no desenho e em testes unitários**, faltando teste HTTP/E2E com tokens reais de dois tenants para fechar a evidência operacional.

## 7. Testes e validações

### 7.1 Resultado executado em 06/10/2026

| Comando | Resultado |
|---|---|
| `backend: npm.cmd test` | **156 aprovados, 0 falhas** |
| `frontend: npm.cmd run test:events` | **8 aprovados, 0 falhas** |
| `backend: npx.cmd prisma validate` | **Schema válido** |

Dos 156 testes backend, **44** são específicos do módulo de Eventos.

### 7.2 Testes backend existentes

| Arquivo | Quantidade | Cobertura principal |
|---|---:|---|
| `eventPricingService.test.js` | 8 | Quantidade, Decimal, grupos, gross-up, indicadores, alertas e bordas |
| `eventValidation.test.js` | 7 | DTOs, tenant forjado, datas, horários, decimais, negativos e campos desconhecidos |
| `eventBudgetService.test.js` | 9 | Itens, bloqueio, tenant, duplicação/remoção, convidados, snapshot, indicadores e proposta pública |
| `eventCatalogService.test.js` | 3 | Política de custo, custo ausente e snapshot de ficha |
| `eventCustomerService.test.js` | 3 | Paginação, normalização e isolamento por tenant |
| `commercialEventService.test.js` | 4 | Criação atômica, relações de outro tenant, edição e cancelamento |
| `eventLifecycleService.test.js` | 4 | Matriz de transição e edição |
| `eventWorkflowService.test.js` | 5 | Envio, checklist, revisão, aprovação atômica e conflito |
| `eventProposalPdfService.test.js` | 1 | Assinatura PDF e ausência de campos internos |

### 7.3 Testes frontend existentes

`src/pages/Events.test.js` possui oito cenários:

- listagem e indicadores;
- criação rápida de cliente e evento;
- item manual de cardápio;
- item de ficha e composição;
- premissas e indicadores de precificação;
- proposta sem campos internos;
- envio e bloqueio visual;
- troca de estabelecimento com editor aberto.

### 7.4 Smokes e ferramentas existentes

- `backend/scripts/check-events-release-readiness.js`: verifica migration, tabelas, índices e natureza aditiva.
- `backend/scripts/smoke-events-database.js`: smoke transacional de cliente/evento/orçamento/item e volume, com rollback.
- `backend/scripts/smoke-core-modules-readonly.js`: consulta módulos existentes em transação somente leitura.
- O release documenta execução anterior do smoke de banco com 55 eventos e rollback integral.

### 7.5 Testes ausentes ou insuficientes

- integração HTTP real das rotas com Express, JWT, papéis e tratamento global de erros;
- E2E autenticado no navegador do fluxo cliente → evento → itens → preço → proposta → envio → revisão → aprovação;
- isolamento real entre dois estabelecimentos pela API, incluindo catálogo;
- concorrência real com duas transações simultâneas de aprovação; o teste atual simula o conflito do Prisma;
- concorrência de criação de nova revisão;
- expiração por data, auditoria da expiração e comportamento de fuso em fronteiras de dia;
- visualização responsiva em larguras mobile/tablet/desktop;
- navegação completa por teclado, foco, leitores de tela e contraste;
- inspeção visual do PDF, quebra de página e caracteres acentuados; o teste atual valida estrutura e conteúdo básico, não renderização;
- estados frontend de erro e retry;
- paginação frontend e volume real via HTTP;
- teste explícito de que aprovação/envio não cria `StockMovement`, `PurchaseOrder` ou altera saldos, embora o smoke readonly e a ausência de chamadas deem boa evidência;
- teste do vínculo de `approvedBudgetId` ao mesmo evento sob escrita direta/erro de implementação.

### 7.6 Cenários manuais recomendados

1. Entrar como `ADMIN`, criar cliente, evento e revisar os dados da revisão 1.
2. Repetir como `MANAGER`; confirmar bloqueio para `STOCK_COUNTER` e usuário sem autenticação.
3. Com dois estabelecimentos, tentar abrir por URL IDs de cliente, evento, orçamento e item do outro tenant.
4. Adicionar item manual, produto e ficha; alterar depois os cadastros de origem e confirmar snapshot estável.
5. Testar quantidade fixa e por convidado, alteração de convidados e margem de segurança.
6. Testar todos os grupos de custo e conferir totais com cálculo independente.
7. Validar preço recomendado, preço negociado, encargos, lucro, margem, CMV e valores por convidado.
8. Tentar enviar sem item de cardápio, sem item visível, sem preço e com custo zero.
9. Gerar proposta HTML/PDF e confirmar ausência de custos, lucro, margem e notas internas.
10. Enviar e tentar editar orçamento/item diretamente pela UI e API.
11. Rejeitar, criar revisão e confirmar IDs novos, conteúdo copiado e snapshot original intacto.
12. Tentar aprovar duas revisões concorrentes e confirmar uma única aprovada.
13. Testar validade ontem/hoje/amanhã no fuso de São Paulo.
14. Cancelar evento com revisões abertas e confirmar idempotência.
15. Em paralelo, abrir produtos, fichas, estoque, compras, vendas e Eventos de Marketing; conferir que nenhum saldo/movimento/compra foi criado.
16. Testar mobile, desktop, teclado, impressão e PDF de proposta curta e longa.
17. Simular API offline/401/403/404/422/500 e validar mensagens/recuperação das telas.

## 8. Gap analysis

| REQUISITO DO PRD/PLANO | IMPLEMENTADO? | PARCIAL? | ARQUIVOS/ROTAS | OBSERVAÇÃO |
|---|---:|---:|---|---|
| Entidades próprias de eventos | Sim | Não | `schema.prisma`, migration | Quatro entidades; `Event` chama-se internamente `CommercialEvent`. |
| Enums/status completos | Sim | Não | `schema.prisma`, `eventConstants.js` | Inclui estados de evento, orçamento, item, grupo e quantidade. |
| Migration somente aditiva | Sim | Não | migration da Fase 01 | Sem alteração destrutiva identificada. |
| Cliente de evento | Sim | Não | `/api/event-customers`, `NewEvent.js` | CRUD backend; UI cobre seleção/criação, não edição. |
| Criar evento e revisão 1 atomicamente | Sim | Não | `POST /api/events`, `commercialEventService.js` | Coberto por teste. |
| Listagem com busca/filtros/paginação | Sim | Sim | `GET /api/events`, `Events.js` | Backend cobre; frontend não expõe período/paginação completos. |
| Informações e edição do evento | Sim | Sim | `GET/PATCH /api/events/:id`, `EventDetail.js` | Backend completo; frontend apenas cria/consulta. |
| Cancelamento do evento | Sim | Sim | `POST /api/events/:id/cancel` | Backend completo; sem ação frontend. |
| Cardápio manual | Sim | Não | editor, budget service | Implementado. |
| Produtos/fichas somente leitura | Sim | Não | `/api/events/catalog-items`, catalog service | Snapshots, sem FK operacional. |
| Composição informativa de ficha | Sim | Não | catalog/editor | Ingredientes diretos; recursão não faz parte explícita do plano da fase. |
| Custos adicionais por grupo | Sim | Não | editor/pricing service | Todos os grupos previstos. |
| Quantidade fixa/por convidado e segurança | Sim | Não | item schema/service | Implementado e testado. |
| Custo total no servidor | Sim | Não | pricing/budget services | Backend autoritativo. |
| Preço recomendado por gross-up | Sim | Não | pricing service | Decimal e versão `EVENT_PRICING_V1`. |
| Preço negociado/manual | Sim | Não | budget service/pricing panel | Implementado. |
| Indicadores comerciais | Sim | Não | pricing service/panel | Lucro, margem, CMV e valores por convidado. |
| Alertas/checklist de qualidade | Sim | Não | budget service/summary | Bloqueia envio quando incompleto. |
| Proposta pública sem custos internos | Sim | Não | `/proposal`, `EventProposal.js` | DTO separado e teste negativo. |
| PDF a partir da proposta/snapshot | Sim | Sim | `/proposal.pdf`, PDF service | Geração existe; falta QA visual completa. |
| Envio congela revisão | Sim | Não | `/send`, workflow service | Snapshots e auditoria. |
| Imutabilidade após envio/aprovação | Sim | Não | budget/workflow services | Reforçada no backend e UI. |
| Rejeição | Sim | Não | `/reject` | Implementada e auditada. |
| Expiração | Sim | Sim | workflow/list/get | Oportunista na consulta; sem job nem auditoria dedicada. |
| Nova revisão com cópia | Sim | Não | `/new-revision` | Novos IDs e snapshots de custo preservados. |
| Histórico de revisões | Sim | Sim | `GET /api/events/:id/budgets`, `EventDetail.js` | Valor, autoria, datas, status e links exibidos. |
| Aprovação apenas de `SENT` | Sim | Não | `/approve` | Implementado. |
| Apenas uma revisão aprovada | Sim | Não | workflow + índice parcial | Defesa em aplicação e banco. |
| Auditoria de ações críticas | Sim | Sim | event/workflow services, `AuditLog` | Envio/rejeição/aprovação/cancelamento; expiração não auditada. |
| Tenant vindo do JWT | Sim | Não | routes/services/repository | Cliente não escolhe tenant. |
| RBAC `ADMIN`/`MANAGER` | Sim | Não | quatro arquivos de rotas | `STOCK_COUNTER` bloqueado. |
| Não afetar estoque/compras/vendas | Sim | Não | migration/services/smoke readonly | Nenhuma integração operacional criada. |
| Não colidir com `ConsumptionEvent` | Sim | Não | `app.js`, rotas/models | Namespace e tabelas separados. |
| Estados loading/erro/retry | Não | Sim | páginas frontend | Loading existe; erro/retry é incompleto em algumas telas. |
| Responsivo e acessível | Não confirmado | Sim | styled components | Há layout adaptativo parcial, sem auditoria manual. |
| Contrato de erro HTTP 400 | Não | Sim | controllers/validate middleware | Parte das validações responde 422. |
| Testes de domínio | Sim | Não | 44 testes backend | Boa cobertura unitária. |
| Testes frontend principais | Sim | Sim | 8 testes frontend | Bons fluxos principais, sem E2E/browser real. |
| Teste de regressão de módulos existentes | Sim | Sim | suíte completa + smoke readonly | Suíte passa; falta smoke funcional autenticado pós-deploy. |

## 9. Pendências

### 9.1 Bloqueadoras para considerar a Fase 01 pronta para uso amplo

1. **Recuperar/confirmar o PRD canônico** e resolver qualquer diferença com o plano derivado. Sem isso não há aceite formal completo de escopo.
2. **Executar smoke HTTP autenticado pós-deploy** com `ADMIN`, `MANAGER`, papel proibido e dois tenants, incluindo todo o workflow.
3. **Validar visualmente frontend e PDF** em desktop/mobile, impressão, teclado, contraste e propostas longas/acentuadas.
4. **Corrigir ou aceitar formalmente os estados de erro que deixam o editor em carregamento indefinido.** Em falha de rede/403/404, o usuário precisa receber erro e caminho de recuperação.
5. **Reconciliar o release checklist com o estado real de backup/PITR e migration**, removendo a contradição entre “migration aplicada” e as pendências externas.

Não foi encontrado bloqueador lógico conhecido no caminho feliz do domínio. Os itens acima bloqueiam a classificação de “pronto para uso amplo”, não necessariamente um piloto controlado.

### 9.2 Importantes, mas não bloqueadoras para piloto controlado

- alinhar HTTP 400 versus 422;
- testar concorrência real de aprovação e nova revisão;
- centralizar as transições reais na matriz de lifecycle ou remover a duplicidade;
- melhorar erros/retry também no carregamento de clientes;
- auditar a expiração e definir seu comportamento quando ninguém consulta a proposta.

### 9.3 Melhorias futuras

- perfil `COMMERCIAL` dedicado, se aprovado pelo negócio;
- job de expiração em vez de atualização oportunista em leitura;
- dashboard/indicadores comerciais mais completos;
- ação explícita para atualizar custos de uma nova revisão;
- proteção adicional no banco para consistência entre evento e `approvedBudgetId`;
- testes visuais automatizados e E2E contínuo;
- observabilidade com métricas de erros, tempo de proposta e conversão.

### 9.4 Itens pertencentes à Fase 02

Conforme a fronteira declarada para a Fase 01, devem permanecer fora desta entrega:

- planejamento operacional do evento aprovado;
- transição efetiva para `PLANNING_PENDING` e estados operacionais posteriores;
- reserva de estoque;
- geração de necessidade ou ordem de compra;
- movimentação/baixa de estoque;
- produção e separação de insumos;
- custo realizado versus orçado;
- integração operacional com vendas, estoque ou `ConsumptionEvent`;
- explosão operacional recursiva de fichas para compra/produção.

## 10. Riscos atuais

| Risco | Probabilidade | Impacto | Controle atual | Ação recomendada |
|---|---|---|---|---|
| Requisito do PRD original não refletido no plano | Média | Alto | Plano derivado detalhado | Recuperar PRD e fazer diff final |
| Falha de autenticação/tenant descoberta apenas em produção | Baixa/Média | Alto | Filtros e unit tests | Smoke HTTP com dois tenants e papéis |
| Tela presa em loading em erro de API | Média | Médio/Alto | Algumas páginas exibem erro | Estado de erro/retry consistente |
| PDF com quebra/acentuação/layout inadequado | Média | Médio | Teste estrutural | QA visual com propostas curtas/longas |
| Duas revisões em corrida | Baixa | Alto | Índices/transações | Teste concorrente real e tratamento uniforme |
| Expiração não ocorrer sem consulta | Média | Médio | Expiração oportunista | Documentar ou criar job futuro |
| Divergência da matriz de status e services | Média no longo prazo | Médio | Testes atuais | Centralizar transições |
| Histórico comercial insuficiente na UI | Alta | Médio | Dados existem no backend | Completar histórico e endpoint |
| Regressão em módulos existentes | Baixa | Alto | 156 testes + smoke readonly | Smoke funcional autenticado pós-deploy |

## 11. Conclusão

### Percentual aproximado

**88% implementado**, considerando:

- dados/migration: aproximadamente 97%;
- regras e backend: aproximadamente 94%;
- frontend funcional: aproximadamente 80%;
- validação operacional/release: aproximadamente 72%.

O percentual não significa cobertura de linhas nem substitui aceite do PRD; é uma estimativa ponderada de requisitos funcionais e de prontidão.

### Está seguro para testar com usuário real?

**Sim, para homologação ou piloto controlado**, desde que:

- o usuário seja `ADMIN` ou `MANAGER`;
- a migration e o backup/PITR do ambiente estejam confirmados;
- exista acompanhamento técnico e dados de teste identificáveis;
- seja executado primeiro o roteiro manual de caminho feliz e isolamento de tenant;
- estoque, compras e vendas sejam monitorados para confirmar ausência de efeitos colaterais.

**Ainda não para liberação ampla/desassistida**, principalmente pela ausência de E2E autenticado, QA visual/responsiva/PDF e tratamento completo de erros no frontend.

### Maiores riscos

1. PRD original ausente, impedindo aceite formal literal.
2. Falta de teste HTTP/E2E com autenticação, papéis e dois tenants.
3. UX de erro incompleta, especialmente carregamento infinito do editor.
4. PDF e responsividade ainda não verificados visualmente.
5. Histórico e listagem abaixo do acabamento funcional descrito no plano.

### Próxima ação recomendada

Realizar uma **rodada de homologação autenticada e instrumentada** em ambiente controlado, usando dois estabelecimentos e os três papéis, seguindo os 17 cenários manuais deste relatório. Registrar evidências de tela/PDF e conferir antes/depois as contagens de movimentos, compras e saldos. Em seguida, corrigir somente os gaps bloqueadores encontrados e repetir o smoke; depois disso, fazer o diff final contra o PRD canônico recuperado.
