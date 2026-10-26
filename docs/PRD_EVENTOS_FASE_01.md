# PRD — Produto de Eventos — Fase 01

**Versão:** 1.0
**Status:** fonte oficial de aceite da Fase 01
**Escopo:** fluxo comercial de eventos, sem operação de estoque ou compras.

> Nota de rastreabilidade: o arquivo canônico citado pela documentação anterior não estava presente no repositório no fechamento de 06/10/2026. Esta versão foi recomposta a partir de `EVENTS_PHASE_01_IMPLEMENTATION_PLAN.md`, que declara ter sido baseado no PRD original, dos requisitos explícitos preservados em `EVENTS_PHASE_01_IMPLEMENTATION_REPORT.md` e da análise de domínio. Caso o documento original seja recuperado, ele deve ser comparado com esta versão antes de substituí-la.

## 1. Problema e objetivo

O sistema precisa permitir que a equipe comercial cadastre um cliente, crie um evento, monte e precifique um orçamento, apresente uma proposta, negocie por revisões e aprove uma única versão, preservando o histórico comercial.

A Fase 01 termina na aprovação comercial. Ela prepara dados para fases operacionais futuras, mas não reserva, compra, produz, movimenta ou baixa estoque.

## 2. Usuários e autorização

- `ADMIN` e `MANAGER` podem listar, visualizar, criar e editar rascunhos, gerar/enviar propostas, rejeitar, revisar, aprovar e cancelar.
- `STOCK_COUNTER` e usuários sem papel permitido não acessam o módulo comercial.
- Toda operação usa o `establishmentId` assinado no JWT.
- Nenhum endpoint aceita o tenant informado pelo cliente como autoridade.
- Recursos de outro estabelecimento não podem ser lidos nem alterados.

## 3. Escopo funcional obrigatório

### 3.1 Clientes

- Cadastrar cliente com nome e dados opcionais de documento, telefone, e-mail e observações.
- Buscar e paginar clientes por nome ou documento.
- Consultar e atualizar cliente dentro do estabelecimento.
- Alterar o cadastro atual não pode alterar snapshots de propostas já enviadas.

### 3.2 Eventos

- Criar evento com cliente, nome, tipo, data, horários opcionais, convidados, local, responsável e observações.
- Gerar código único por estabelecimento.
- Criar o evento e o orçamento revisão 1 na mesma transação.
- Listar eventos com paginação, busca, status e período.
- Consultar detalhe e histórico resumido de revisões.
- Editar informações somente enquanto existir revisão `DRAFT` e o evento estiver em estado editável.
- Cancelar o evento e suas revisões abertas de forma auditada e idempotente.

### 3.3 Orçamento e itens

- Uma linha de `EventBudget` representa uma revisão.
- Permitir itens manuais desde o primeiro fluxo utilizável.
- Permitir referências somente leitura a `Product`, `Recipe` e ingredientes diretos da ficha.
- Copiar nome, unidade, custo, preço sugerido, origem/data de custo e composição disponível para snapshot.
- Permitir grupos de custo `MENU`, `STAFF`, `SERVICE`, `EQUIPMENT`, `TRANSPORT`, `FEE` e `OTHER`.
- Permitir quantidade `FIXED` ou `PER_GUEST`, com margem de segurança.
- Itens fora de cardápio usam quantidade fixa e segurança zero nesta fase.
- Recalcular no servidor após mutações de item, convidados ou premissas.
- Itens e orçamentos só podem ser alterados em `DRAFT`.

### 3.4 Precificação

O backend é a autoridade dos cálculos e usa precisão decimal.

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

Requisitos:

- totalizar cardápio, equipe, serviços, equipamentos, transporte, taxas, outros e custo total;
- calcular preço recomendado, preço negociado/manual, encargos, lucro, margem efetiva e CMV do cardápio;
- calcular preço, custo e lucro por convidado;
- rejeitar negativos e denominador menor ou igual a zero;
- não usar ponto flutuante binário como fonte de verdade financeira;
- alertar preço abaixo do equilíbrio e margem abaixo da meta sem impedir o salvamento do rascunho;
- versionar a política como `EVENT_PRICING_V1`.

### 3.5 Proposta e snapshots

- Permitir pré-visualizar proposta em rascunho.
- A proposta pública não pode mostrar custo unitário, custo total interno, lucro, margem ou notas internas.
- Exibir apenas itens marcados como visíveis.
- Gerar HTML imprimível e PDF com revisão, cliente, evento, itens, valor, valor por convidado, validade e observações públicas.
- Ao enviar, congelar cliente e dados do evento no orçamento.
- Alterações futuras em cliente, produto ou ficha não podem modificar revisões enviadas.
- A reimpressão de proposta enviada usa o snapshot, não os cadastros atuais.

### 3.6 Workflow e revisões

Status de orçamento: `DRAFT`, `SENT`, `APPROVED`, `REJECTED`, `EXPIRED`, `CANCELLED`.

- `DRAFT` pode ser editado e enviado.
- Envio exige item de cardápio, item visível, preço negociado positivo e ausência de item com custo zero.
- `SENT` é imutável e pode ser aprovado, rejeitado ou originar nova revisão.
- `REJECTED` e `EXPIRED` podem originar nova revisão.
- Nova revisão copia premissas e itens com novos IDs, preservando os snapshots de custo existentes.
- Aprovação só ocorre a partir de `SENT`.
- No máximo uma revisão pode ficar `APPROVED` por evento, com proteção transacional e de banco.
- Aprovar vincula `approvedBudgetId`, cancela/bloqueia outras revisões abertas e muda o evento para `APPROVED`.
- Envio, rejeição, nova revisão, aprovação e cancelamento devem ser auditáveis.
- Propostas vencidas devem ser tratadas ao consultar/listar enquanto não houver scheduler.

## 4. Dados obrigatórios

### 4.1 Entidades

- `EventCustomer`.
- `CommercialEvent` como nome interno seguro para o conceito público `Event`.
- `EventBudget`.
- `EventBudgetItem`.

### 4.2 Integridade

- Unicidade de código por estabelecimento.
- Unicidade de `(eventId, revision)`.
- No máximo um orçamento aprovado por evento.
- Quantidades, convidados, custos e percentuais com constraints coerentes.
- Dinheiro `Decimal(14,4)`, quantidades `Decimal(14,3/4)` e percentuais `Decimal(7,4)`.
- Data de evento/validade como data civil; horários sem conversão de fuso; auditoria em UTC.
- Migration exclusivamente aditiva.

## 5. API mínima

### Clientes

- `GET /api/event-customers`
- `POST /api/event-customers`
- `GET /api/event-customers/:id`
- `PATCH /api/event-customers/:id`

### Eventos

- `GET /api/events`
- `POST /api/events`
- `GET /api/events/:id`
- `PATCH /api/events/:id`
- `POST /api/events/:id/cancel`
- `GET /api/events/catalog-items`
- `GET /api/events/:eventId/budgets`

### Orçamentos

- `GET /api/event-budgets/:id`
- `PATCH /api/event-budgets/:id`
- `POST /api/event-budgets/:id/recalculate`
- `POST /api/event-budgets/:id/items`
- `PATCH /api/event-budget-items/:id`
- `DELETE /api/event-budget-items/:id`
- `POST /api/event-budgets/:id/send`
- `POST /api/event-budgets/:id/approve`
- `POST /api/event-budgets/:id/reject`
- `POST /api/event-budgets/:id/new-revision`
- `GET /api/event-budgets/:id/proposal`
- `GET /api/event-budgets/:id/proposal.pdf`

Respostas paginadas usam `items`, `page`, `pageSize` e `total`. Conflitos de estado retornam 409; ausência de autenticação 401; papel insuficiente 403; recurso não encontrado no tenant 404; erros de entrada usam 400 ou 422 de forma consistente e documentada. Decimais trafegam como strings.

## 6. Frontend mínimo

- `/events`: listagem, busca, filtros principais, estados vazio/carregando/erro e paginação.
- `/events/new`: informações e cadastro rápido de cliente.
- `/events/:id`: detalhe e histórico de revisões.
- `/events/:eventId/budgets/:budgetId/edit`: cardápio, custos, precificação e resumo.
- `/events/:eventId/budgets/:budgetId/proposal`: proposta pública e imprimível.
- Bloqueio visual de revisões não editáveis, sempre reforçado pelo backend.
- Mensagens de erro claras, com ação de tentar novamente ou voltar.
- Layout utilizável em desktop e mobile, por teclado, sem depender somente de cor.
- Manter “Eventos de Marketing” e `/api/consumption-events` inalterados.

## 7. Fora de escopo da Fase 01

- reserva ou consulta de disponibilidade comprometida de estoque;
- criação de `EventRequirement`, `EventInventoryReservation`, `EventCost` ou `EventPurchaseAllocation`;
- geração de necessidades ou ordens de compra;
- baixa, entrada, transferência ou qualquer movimento de estoque;
- produção, separação, checkout ou retorno de insumos;
- custo realizado e previsto versus realizado;
- criação de venda/faturamento do evento;
- integração operacional com `ConsumptionEvent`;
- planejamento de equipe/equipamento/capacidade;
- cotação formal, contrato, assinatura eletrônica ou cobrança.

## 8. Critérios de aceite

1. Migration, schema e Prisma Client são consistentes e aditivos.
2. Tenant e papéis são aplicados no backend e comprovados por teste HTTP autenticado.
3. Motor de cálculo possui testes de sucesso e borda.
4. Snapshots permanecem estáveis após alterações nas origens.
5. Revisões enviadas/aprovadas são imutáveis por todos os endpoints.
6. Proposta HTML/PDF não vaza dados internos.
7. Aprovação única é protegida no service e no banco.
8. Fluxo principal funciona de cliente até aprovação e nova revisão.
9. Falhas de carregamento no frontend não deixam a tela presa e oferecem recuperação.
10. Fluxo funciona em desktop/mobile e PDF é visualmente aceitável.
11. Testes de regressão passam e o fluxo não altera produtos, saldos, movimentos, compras, vendas nem eventos de consumo.
12. Release e rollback estão documentados sem contradições materiais.

## 9. Decisão de liberação

- **Homologação:** permitida quando os critérios automatizáveis estiverem verdes e as limitações visuais estiverem explicitadas.
- **Piloto controlado:** permitido após smoke autenticado no ambiente alvo e validação manual de proposta/PDF.
- **Produção ampla:** exige fechamento dos bloqueadores registrados no relatório de aceite, monitoramento e confirmação de backup/PITR.
