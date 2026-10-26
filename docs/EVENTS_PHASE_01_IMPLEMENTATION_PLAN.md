# Plano de implementação — Eventos Fase 01

> Baseado no `PRD_EVENTOS_FASE_01.md`, em `docs/SYSTEM_CURRENT_STATE.md` e em `docs/EVENTS_MODULE_ANALYSIS.md`.
> Este plano cobre somente o fluxo comercial: cliente, evento, orçamento, precificação, proposta, revisão e aprovação.

## 1. Resultado esperado

Ao final da Fase 01, um usuário autorizado poderá:

1. cadastrar ou selecionar um cliente;
2. criar um evento com data, horário, local e convidados;
3. montar o orçamento com cardápio e custos adicionais;
4. usar itens manuais ou referências somente leitura a produtos e fichas existentes;
5. simular preço, encargos, margem, CMV e valores por convidado;
6. gerar uma proposta sem expor custos internos;
7. enviar, rejeitar, revisar e aprovar o orçamento;
8. consultar todas as revisões sem alterar snapshots históricos.

O módulo não movimentará estoque, reservará produtos, criará compras, registrará custo realizado nem alterará o comportamento de vendas, produção ou do atual `ConsumptionEvent`.

## 2. Decisões de arquitetura

### 2.1 Limite do módulo

- Usar `establishmentId` do JWT como tenant em todas as operações.
- Manter `/api/consumption-events` e a tela “Eventos de Marketing” inalterados.
- Usar `CommercialEvent` como nome interno do model para eliminar ambiguidade com `ConsumptionEvent` e com o objeto nativo `Event` do navegador.
- Usar `/api/events` como namespace público do novo módulo.
- Criar tabelas próprias com prefixo `commercial_event_`.
- Consultar `Product`, `Recipe` e `RecipeItem` somente para leitura e copiar os dados usados para o snapshot do orçamento.
- Concentrar regras em services; controllers apenas adaptam HTTP e repositories concentram Prisma.
- Tratar o backend como autoridade dos cálculos. O frontend pode pré-visualizar valores, mas deve exibir os totais devolvidos pela API após salvar ou recalcular.

### 2.2 Decisões funcionais do MVP

- Item manual estará disponível desde o primeiro fluxo utilizável.
- Integração com produtos e fichas entra ainda na Fase 01, depois do fluxo manual estar coberto por testes.
- Orçamento é editável somente em `DRAFT`.
- A ação “Gerar proposta” pode pré-visualizar um rascunho; somente “Marcar como enviada” congela a revisão.
- Aprovação será permitida apenas a partir de `SENT`.
- Aprovar uma revisão será transacional e garantirá no máximo uma revisão aprovada por evento.
- Na Fase 01, aprovação levará o evento a `APPROVED`; `PLANNING_PENDING` fica preparado para a integração operacional futura.
- PDF entra no último incremento. A proposta HTML faz parte do fluxo obrigatório antes dele.
- Valores monetários e percentuais serão persistidos com `Decimal`; cálculos financeiros não usarão `Number`/ponto flutuante como fonte de verdade.

### 2.3 Ajustes necessários ao modelo sugerido no PRD

- Adicionar `costGroup` ao item. `itemType` informa a origem/natureza (`RECIPE`, `PRODUCT`, `MANUAL` etc.), mas um item `MANUAL` ainda precisa ser classificado como cardápio, equipe, transporte ou outro para totalização correta.
- Adicionar snapshots de cliente e evento ao orçamento. `guestCountSnapshot` sozinho não preserva nome, documento, data, horário e local da proposta enviada.
- Adicionar `calculationVersion` para permitir evolução futura da fórmula sem reinterpretar revisões antigas.
- Adicionar `parentBudgetId` para rastrear de qual revisão uma nova revisão foi copiada.
- Registrar origem e data do custo dentro do snapshot do item.

## 3. Modelo de dados alvo

### 3.1 Enums

| Enum | Valores iniciais |
|---|---|
| `CommercialEventStatus` | `DRAFT`, `BUDGETING`, `APPROVED`, `PLANNING_PENDING`, `CANCELLED` |
| `EventBudgetStatus` | `DRAFT`, `SENT`, `APPROVED`, `REJECTED`, `EXPIRED`, `CANCELLED` |
| `EventBudgetItemType` | `RECIPE`, `PRODUCT`, `MANUAL`, `STAFF`, `SERVICE`, `EQUIPMENT`, `TRANSPORT`, `FEE`, `OTHER` |
| `EventBudgetCostGroup` | `MENU`, `STAFF`, `SERVICE`, `EQUIPMENT`, `TRANSPORT`, `FEE`, `OTHER` |
| `EventQuantityMode` | `FIXED`, `PER_GUEST` |

### 3.2 Entidades

#### `EventCustomer`

- `id`, `establishmentId`, `name`, `document`, `phone`, `email`, `notes` e timestamps.
- Índices por `establishmentId`, nome e documento.
- Toda busca e alteração deve filtrar pelo tenant do JWT.

#### `CommercialEvent`

- `id`, `establishmentId`, `code`, `customerId`, `name`, `type`, `eventDate`, `startTime`, `endTime`, `guestCount`, `location`, `responsibleUserId`, `status`, `internalNotes`, `approvedBudgetId` e timestamps.
- Código gerado no servidor e único por estabelecimento.
- Índices para listagem por tenant/data/status e busca por cliente.
- Relações nomeadas no Prisma para evitar ambiguidade entre a coleção de orçamentos e o orçamento aprovado.

#### `EventBudget`

- Identidade: `id`, `eventId`, `revision`, `parentBudgetId`, `status`.
- Snapshot comercial: `customerSnapshot`, `eventSnapshot`, `guestCountSnapshot`.
- Totais: cardápio, equipe, serviço, equipamento, transporte, taxas, outros e custo total.
- Precificação: margem desejada, impostos, comissão, cartão, outras taxas, preço recomendado e preço negociado.
- Indicadores: encargos, lucro, margem efetiva, CMV do cardápio e valores por convidado.
- Documento: validade, observações para cliente, observações internas e `calculationVersion`.
- Auditoria: criador, aprovador, datas de envio/aprovação e timestamps.
- Restrição única `(eventId, revision)`.
- Restrição de banco para impedir mais de um orçamento `APPROVED` por evento, complementada por transação no service.

#### `EventBudgetItem`

- Identidade/classificação: `id`, `budgetId`, `itemType`, `costGroup`, `sourceId`, `sourceType`.
- Snapshot: nome, categoria, unidade, custo unitário, preço sugerido, composição e metadados da origem.
- Quantidade: modo, fixa, por convidado, convidados, segurança e quantidade planejada.
- Totais e apresentação: custo total, visibilidade, rótulo de proposta, nota interna e ordem.
- Restrição de que a quantidade correspondente ao `quantityMode` seja positiva.
- Itens que não são cardápio usam `FIXED` e margem de segurança zero no MVP.

### 3.3 Precisão e datas

- Dinheiro: `Decimal(14, 4)` internamente e arredondamento monetário para duas casas na exibição.
- Quantidades: `Decimal(14, 3)`.
- Percentuais: `Decimal(7, 4)`, armazenados como percentuais humanos (`30.0000` para 30%).
- `eventDate`/`validUntil`: data civil (`@db.Date`).
- Horários: valores de hora sem conversão de fuso; API em `HH:mm`.
- Timestamps de auditoria: UTC, apresentados no fuso do estabelecimento/aplicação.

### 3.4 Migration

A migration deve ser somente aditiva:

- criar enums, quatro tabelas, FKs, índices e constraints;
- adicionar relações nos models `establishments`, `users`, `Product` e `Recipe` apenas quando necessárias;
- não renomear nem alterar colunas de módulos existentes;
- incluir índice único parcial para uma aprovação por evento, se necessário via SQL da migration;
- validar `prisma format`, `prisma validate` e `prisma generate` antes de aplicar em qualquer banco compartilhado.

## 4. Contrato de API

Todos os endpoints usam `authMiddleware`; nenhum aceita `establishmentId` do cliente.

### 4.1 Clientes

| Método | Rota | Uso |
|---|---|---|
| `GET` | `/api/event-customers` | Busca paginada por nome/documento |
| `POST` | `/api/event-customers` | Criar e devolver cliente selecionável |
| `GET` | `/api/event-customers/:id` | Detalhar dentro do tenant |
| `PATCH` | `/api/event-customers/:id` | Atualizar cadastro atual, sem alterar snapshots antigos |

### 4.2 Eventos

| Método | Rota | Uso |
|---|---|---|
| `GET` | `/api/events` | Paginação, busca, status, período e próximos eventos |
| `POST` | `/api/events` | Criar evento e orçamento revisão 1 em uma transação |
| `GET` | `/api/events/:id` | Detalhe, revisão vigente e histórico resumido |
| `PATCH` | `/api/events/:id` | Editar informações enquanto houver revisão `DRAFT` |
| `POST` | `/api/events/:id/cancel` | Cancelar com validação de estado |
| `GET` | `/api/events/catalog-items` | Busca somente leitura de produtos/fichas do tenant |

### 4.3 Orçamentos e itens

| Método | Rota | Uso |
|---|---|---|
| `GET` | `/api/events/:eventId/budgets` | Histórico de revisões |
| `GET` | `/api/event-budgets/:id` | Orçamento completo com itens e totais |
| `PATCH` | `/api/event-budgets/:id` | Premissas, encargos, notas e preço negociado em `DRAFT` |
| `POST` | `/api/event-budgets/:id/items` | Adicionar item e recalcular |
| `PATCH` | `/api/event-budget-items/:id` | Editar item `DRAFT` e recalcular |
| `DELETE` | `/api/event-budget-items/:id` | Remover item `DRAFT` e recalcular |
| `POST` | `/api/event-budgets/:id/recalculate` | Recalcular e persistir totais do rascunho |
| `POST` | `/api/event-budgets/:id/send` | Validar, gerar snapshots finais e congelar |
| `POST` | `/api/event-budgets/:id/approve` | Aprovação transacional e auditada |
| `POST` | `/api/event-budgets/:id/reject` | Rejeitar revisão enviada |
| `POST` | `/api/event-budgets/:id/new-revision` | Copiar revisão para um novo `DRAFT` |

### 4.4 Proposta

| Método | Rota | Uso |
|---|---|---|
| `GET` | `/api/event-budgets/:id/proposal` | DTO limpo, sem custos internos |
| `GET` | `/api/event-budgets/:id/proposal.pdf` | PDF gerado sempre a partir do snapshot |

### 4.5 Padrões de resposta e erro

- Paginação: `items`, `page`, `pageSize`, `total`.
- Validação: HTTP `400` com erros de campo.
- Não autenticado: `401`; papel insuficiente ou outro tenant: `403`; recurso inexistente no tenant: `404` quando for mais seguro.
- Conflito de estado/revisão: `409`, por exemplo ao editar um orçamento enviado ou aprovar quando outra revisão já foi aprovada.
- DTOs decimais trafegam como strings para preservar precisão.

## 5. Serviços e regras de domínio

### 5.1 `eventPricingService`

Implementar como funções puras e testáveis:

```text
plannedQuantity = baseQuantity * (1 + safetyPercent / 100)
itemTotal = plannedQuantity * unitCost
revenueRate = (tax + commission + cardFee + otherFee) / 100
recommendedPrice = totalCost / (1 - desiredMargin / 100 - revenueRate)
feeAmount = quotedPrice * revenueRate
expectedProfit = quotedPrice - totalCost - feeAmount
effectiveMargin = expectedProfit / quotedPrice
menuCMV = menuCost / quotedPrice
```

Regras:

- rejeitar quantidade, custo ou percentual negativos;
- rejeitar denominador menor ou igual a zero;
- evitar divisão por zero para preço/convidados;
- arredondar somente nos limites definidos, não a cada subtotal intermediário;
- retornar alertas de margem abaixo da meta e preço abaixo do ponto de equilíbrio sem bloquear o salvamento;
- versionar a política inicialmente como `EVENT_PRICING_V1`.

### 5.2 `eventSnapshotService`

- Produto simples: copiar nome, categoria, unidade, `currentCost`, preço de venda e origem/data do custo.
- Ficha: copiar produto final, rendimento, ingredientes diretos disponíveis e custos usados; a composição é informativa nesta fase.
- Item manual: copiar integralmente os dados digitados.
- Ao enviar, copiar cliente e dados do evento para o orçamento.
- Depois de `SENT`, nenhum endpoint genérico pode alterar orçamento ou itens.

### 5.3 `eventBudgetService`

- Recalcular todos os totais no servidor após mutação de item ou premissa.
- Criar revisão em transação, usando incremento seguro de `revision`.
- Copiar itens e premissas da revisão de origem, gerando novos IDs.
- Não reconsultar custos atuais ao copiar: a nova revisão começa com os snapshots anteriores. Uma ação explícita de atualização de custo pode ser adicionada futuramente.

### 5.4 `commercialEventService`

- Aplicar transições de estado explicitamente.
- Na aprovação: validar checklist, travar o evento/revisões na transação, aprovar uma revisão, cancelar ou bloquear outras revisões abertas, definir `approvedBudgetId` e atualizar o evento.
- Registrar envio, rejeição, aprovação e cancelamento em `AuditLog`.
- Tratar propostas vencidas antes de listar/detalhar, pois o sistema atual não possui worker ou cron.

## 6. Autorização

Mapeamento inicial sobre os papéis que já existem:

| Ação | `ADMIN` | `MANAGER` | `STOCK_COUNTER` |
|---|---:|---:|---:|
| Listar e visualizar comercial | Sim | Sim | Não |
| Criar/editar rascunho | Sim | Sim | Não |
| Gerar proposta/enviar | Sim | Sim | Não |
| Aprovar/rejeitar/cancelar | Sim | Sim | Não |
| Ver evento aprovado para operação futura | Sim | Sim | Futuro |

Se for necessário um perfil “Comercial” independente, ele deve ser criado como decisão transversal de RBAC, incluindo tela de usuários, emissão do JWT e testes. Não será inferido apenas no frontend.

## 7. Frontend

### 7.1 Rotas

- `/events`: listagem, filtros e indicadores básicos.
- `/events/new`: criação do evento e revisão inicial.
- `/events/:id`: detalhe e histórico de revisões.
- `/events/:eventId/budgets/:budgetId/edit`: editor em etapas.
- `/events/:eventId/budgets/:budgetId/proposal`: proposta limpa/imprimível.

Adicionar “Eventos” à navegação sem renomear “Eventos de Marketing”. Para evitar confusão visual, recomenda-se apresentar o item antigo como “Consumo em Eventos” em uma fase posterior, sem mudar sua rota agora.

### 7.2 Componentes principais

- `EventsList`: busca, filtros, tabela, estados vazios e paginação.
- `EventInformationStep`: evento, cliente e modal de cadastro rápido.
- `EventMenuStep`: busca de ficha/produto, item manual e composição.
- `EventCostsStep`: equipe, serviço, equipamento, transporte, taxa e outros.
- `EventPricingStep`: simulador, alertas e indicadores.
- `EventSummaryStep`: resumo interno e ações de workflow.
- `EventProposal`: DTO público sem campos financeiros internos.
- `BudgetRevisionHistory`: revisão, status, valor e datas.

### 7.3 Estado e experiência

- Estado do editor local por revisão, sem adicionar uma nova biblioteca global.
- Salvamento explícito por etapa no primeiro incremento; autosave só depois de estabilizar conflitos e mensagens de erro.
- Bloqueio visual baseado no status, sempre reforçado pelo backend.
- Layout responsivo e acessível por teclado; mensagens não dependem apenas de cor.
- Formatação BRL e percentual apenas na apresentação; payload normalizado para a API.

## 8. Plano incremental de entrega

### Incremento 0 — Contratos e fundação

Objetivo: fechar o desenho técnico antes de espalhar regras pelo código.

- [x] Definir enums, DTOs, matriz de transições e precisão decimal.
- [x] Criar `eventPricingService` puro com testes de fórmula e bordas.
- [x] Criar schemas Zod compartilhando regras de entrada do módulo.
- [x] Definir factories/fixtures de testes para tenant, usuário e eventos.

Saída: motor de cálculo testado e contrato pronto para persistência.

### Incremento 1 — Banco, clientes e eventos

Objetivo: criar e localizar um evento comercial sem orçamento detalhado.

- [x] Adicionar models/enums ao Prisma e migration aditiva.
- [x] Implementar repositories, services, controllers e rotas de clientes.
- [x] Implementar criação/listagem/detalhe/edição/cancelamento de eventos.
- [x] Criar evento e orçamento revisão 1 na mesma transação.
- [x] Montar `/events`, `/events/new`, modal de cliente e navegação.
- [x] Testar tenant isolation e validações de data/convidados/horário.

Gate: usuário cria um evento com cliente, data e convidados e o encontra na listagem.

### Incremento 2 — Orçamento manual e custos

Objetivo: obter um orçamento completo sem depender dos cadastros atuais.

- [x] Implementar CRUD de `EventBudgetItem` somente em `DRAFT`.
- [x] Implementar quantidade fixa, por convidado e margem de segurança.
- [x] Implementar agrupamento e totais por `costGroup`.
- [x] Construir etapas Cardápio e Custos com itens manuais.
- [x] Recalcular no backend após cada mutação relevante.
- [x] Cobrir duplicação e remoção de itens e mudanças no número de convidados.

Gate: usuário monta cardápio e custos adicionais e vê o custo total correto.

### Incremento 3 — Produtos, fichas e snapshots

Objetivo: reutilizar o catálogo atual sem criar acoplamento histórico.

- [x] Criar busca somente leitura de produtos e fichas do estabelecimento.
- [x] Definir a política de custo da Fase 01 e expor a origem usada.
- [x] Criar item `PRODUCT` e `RECIPE` com snapshots completos.
- [x] Exibir composição informativa da ficha.
- [x] Provar por teste que alterar produto/ficha não muda um item já salvo.
- [x] Alertar custo ausente/zero antes de enviar ou aprovar.

Gate: orçamento mistura itens manuais, produtos e fichas sem depender de seus valores futuros.

### Incremento 4 — Precificação e resumo

Objetivo: permitir decisão comercial segura.

- [x] Construir tela de precificação e edição do preço negociado.
- [x] Exibir preço recomendado, encargos, lucro, margem efetiva e CMV.
- [x] Exibir preço/custo/lucro por convidado.
- [x] Implementar alertas do PRD e checklist de qualidade.
- [x] Construir resumo interno e DTO de proposta sem custos internos.
- [x] Testar paridade entre cálculo exibido e persistido.

Gate: todos os exemplos de cálculo e critérios 24.5–24.7 do PRD passam.

### Incremento 5 — Workflow, revisões e proposta

Objetivo: fechar o ciclo comercial e a imutabilidade.

- [x] Implementar envio, expiração, rejeição, nova revisão e aprovação.
- [x] Bloquear mutações de qualquer revisão que não seja `DRAFT`.
- [x] Garantir aprovação única com transação e constraint de banco.
- [x] Implementar histórico de revisões e ações por status.
- [x] Registrar ações críticas em `AuditLog`.
- [x] Gerar PDF a partir do snapshot e oferecer impressão/ download.
- [x] Testar concorrência de aprovação e cópia completa de revisão.

Gate: fluxo `DRAFT -> SENT -> APPROVED` e caminho de nova revisão funcionam ponta a ponta.

### Incremento 6 — Endurecimento e liberação

Objetivo: liberar sem regressão nos módulos atuais.

- [x] Executar testes backend e frontend existentes e novos.
- [x] Testar troca de estabelecimento com o editor aberto.
- [ ] Validar responsividade, acessibilidade e impressão/PDF.
- [x] Validar listagem com volume e índices usando paginação.
- [x] Executar smoke test de produtos, fichas, estoque, compras, vendas e `ConsumptionEvent`.
- [x] Preparar plano de deploy da migration e rollback de aplicação.
- [x] Documentar variáveis/defaults e atualizar estado atual do sistema após a entrega.

Gate: checklist de pronto completo e nenhuma regressão conhecida.

## 9. Estratégia de testes

### 9.1 Unitários

- quantidade fixa e por convidado com segurança;
- totais por grupo;
- gross-up do preço recomendado;
- denominador zero/negativo;
- margem efetiva, CMV e indicadores por convidado;
- arredondamento e valores-limite;
- matriz de transições de status.

### 9.2 Integração/backend

- tenant A não lê nem altera cliente, evento, orçamento ou item do tenant B;
- IDs de outro tenant não podem ser usados como fonte de produto/ficha;
- revisão enviada/aprovada rejeita qualquer mutação;
- nova revisão copia todos os snapshots e gera IDs próprios;
- duas aprovações concorrentes resultam em apenas uma aprovada;
- transação de aprovação atualiza orçamento e evento por completo ou nada;
- proposta nunca retorna custo unitário, custo total, lucro, margem ou notas internas.

### 9.3 Frontend

- criação rápida de cliente seleciona o registro criado;
- validação das cinco etapas;
- alteração de convidados recalcula itens `PER_GUEST`;
- alertas de margem e prejuízo;
- botões corretos por status;
- renderização da proposta somente com itens visíveis;
- estados vazio, carregando, erro e retry.

### 9.4 Regressão obrigatória

- `/api/consumption-events` e “Eventos de Marketing” continuam iguais;
- salvar/aprovar orçamento não cria `StockMovement`, não muda `Product.quantity`/`ProductStock` e não cria `PurchaseOrder`;
- produtos, fichas, compras, produção e vendas mantêm seus testes atuais.

## 10. Critério de pronto

Uma entrega só pode ser considerada pronta quando:

- migration, schema e Prisma Client estão consistentes;
- regras de tenant e papel são aplicadas no backend;
- cálculo possui cobertura unitária para sucesso e bordas;
- snapshots permanecem estáveis após mudanças nos cadastros de origem;
- revisão enviada/aprovada é imutável por todos os endpoints;
- proposta não vaza dados internos;
- aprovação única está protegida no service e no banco;
- fluxo principal funciona em desktop e mobile;
- testes de regressão passam;
- documentação de API e decisões é atualizada.

## 11. Riscos e controles

| Risco | Controle nesta fase |
|---|---|
| Confundir evento comercial com `ConsumptionEvent` | Nome interno, tabelas e rotas separados |
| Vazamento entre estabelecimentos | Tenant sempre vindo do JWT e filtro em repository/service |
| Histórico mudar com produto/ficha | Snapshots no item e no orçamento; proposta lê snapshot |
| Divergência entre frontend e backend | Backend autoritativo e testes de paridade |
| Margem tratada como markup | Serviço único com fórmula versionada e testes |
| Ambiguidade do item manual | `costGroup` separado de `itemType` |
| Duas revisões aprovadas | Transação, lock/checagem e índice único parcial |
| Valores incorretos por ponto flutuante | Prisma Decimal/decimal library e strings na API |
| Expiração sem scheduler | Atualização controlada ao consultar/listar até existir job dedicado |
| Escopo operacional entrar cedo | Testes negativos garantindo ausência de estoque/compra/reserva |

## 12. Premissas a validar sem bloquear o início

Defaults iniciais sugeridos, centralizados em configuração e editáveis por orçamento:

- margem desejada: `30%`;
- impostos, comissão, cartão e outras taxas: `0%`;
- validade da proposta: `10 dias`;
- margem de segurança do item: `0%`;
- aprovadores: `ADMIN` e `MANAGER`;
- tipos iniciais de evento: os oito tipos listados no PRD;
- PDF: incluído no acabamento da Fase 01;
- nome do produto: manter nomenclatura neutra “Eventos” até decisão de marca.

As duas decisões que mais podem alterar implementação são a política de custo de produto/ficha e a necessidade de um papel `COMMERCIAL` próprio. Elas devem ser confirmadas antes dos incrementos 3 e 5, respectivamente.

## 13. Próximo passo recomendado

Começar pelo Incremento 0 e entregar primeiro o motor de cálculo com testes. Em seguida, criar a migration e o fluxo vertical mínimo “cliente -> evento -> orçamento manual”. Esse caminho valida o núcleo comercial antes de integrar produtos/fichas e mantém todo o trabalho operacional fora da Fase 01.
