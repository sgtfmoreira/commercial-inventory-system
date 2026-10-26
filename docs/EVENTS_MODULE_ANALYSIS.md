# Análise do módulo de Eventos

> Proposta baseada na auditoria documentada em `docs/SYSTEM_CURRENT_STATE.md`. Não é implementação. Os nomes abaixo são sugestões novas; os nomes existentes citados preservam exatamente o schema atual.

## 1. Conclusão e estratégia

O sistema já possui boa parte do motor operacional necessário: produtos e embalagens, fornecedores e preços, fichas, explosão recursiva, estoque por local, sugestões/ordens/recebimento, movimentos com custo congelado, vendas e relatórios financeiros. O que falta é a camada comercial e de planejamento do evento: cliente, agenda/status, orçamento versionado, snapshot, reserva, consolidação de necessidades e reconciliação previsto × realizado.

Estimativa de reaproveitamento:

- **Infraestrutura técnica:** 70–75% (auth, tenant, API, ORM, componentes, PDFs, serviços de estoque/compra e relatórios).
- **Regras de domínio do módulo:** 50–55% (explosão, custo, embalagem, estoque e compras existem; orçamento, reserva e reconciliação não).
- **Estimativa combinada do MVP:** aproximadamente **60–65% reutilizável**.

Recomendação central: criar um agregado de Eventos pequeno e isolado, reaproveitar os serviços existentes por funções de domínio extraídas, e não transformar `ConsumptionEvent` no novo evento comercial. O model atual registra retirada/devolução; não possui cliente, convidados, agenda, orçamento ou versões.

## 2. Funcionalidades reutilizáveis

| Capacidade | Entidade/serviço atual | Forma de reutilização |
|---|---|---|
| Tenant e usuário | `Organization`, `establishments`, `users`, `UserEstablishment`, JWT | Todo evento pertence a um estabelecimento; acesso deriva do JWT. |
| Produtos/insumos/preparações | `Product`, `ProductType` | `INVENTORY` como insumo; `PRODUCTION` como prato/drink/preparação. |
| Ficha e rendimento | `Recipe`, `RecipeItem` | Base do cardápio e explosão de insumos. |
| Explosão recursiva | `explodeDemandRecursive` e `consumeProduct` | Extrair para serviço puro compartilhado de necessidades, sem ler saldo pronto durante o cálculo bruto. |
| Unidade/embalagem | `unit`, `purchaseUnit`, `packQuantity` | Conversão simples base ↔ embalagem; precisa validação/versionamento. |
| Custo | `currentCost`, `unitPrice`, `getProductCost`, movimentos | Fonte para simulação; copiar valores e origem para o snapshot aprovado. |
| Estoque por local | `Product.quantity`, `ProductStock`, `StockLocation` | Disponível e reserva por produto/local. |
| Fornecedores/preços | `Supplier`, `ProductSupplier`, `SupplierPriceHistory` | Comparação e sugestão de fornecedor. |
| Catálogo central/portal | `OrganizationProduct`, `OrganizationSupplier`, `SupplierCatalogItem`, `SupplierPriceUpdate` | Preços de rede e atualização pelos fornecedores. |
| Sugestão e arredondamento | `purchaseSuggestionService` | Reaproveitar a ideia; criar cálculo específico por evento e data. |
| Compra/recebimento | `PurchaseOrder`, itens, nota, devolução | Gerar pedidos e medir custo comprado/recebido. |
| Movimento/custo real | `StockMovement` | Registrar consumo, retorno, perda e custo efetivo do evento. |
| Retirada/devolução | `ConsumptionEvent` service | Reutilizar regras de checkout/checkin, não o agregado como evento comercial. |
| PDF | PDFKit, jsPDF/AutoTable | Proposta comercial, ordem operacional e fechamento. |
| Financeiro | `Sale`, `SaleItem`, `reportsService` | Registrar receita do evento e usar fórmulas de CMV/margem. |
| Auditoria | `AuditLog` | Registrar aprovação, revisão, cancelamento, reserva e encerramento. |

## 3. Gap analysis

Legenda: “Parcial” significa que existe uma regra próxima, mas não o workflow exigido.

| Funcionalidade | Já existe | Existe parcialmente | Precisa ser criada | Entidade atual reutilizada | Alteração necessária |
|---|---:|---:|---:|---|---|
| Cliente | Não | Não | Sim | — | Criar cadastro/snapshot de cliente. |
| Evento com data, horário, local, convidados e status | Não | `ConsumptionEvent` só tem nome/status/datas | Sim | `establishments` | Novo agregado `Event`; não sobrecarregar evento de marketing. |
| Cardápio com produtos/pratos/drinks | Não | Sim | Sim | `Product`, `Recipe` | Itens do orçamento referenciam produtos e congelam snapshot. |
| Pacotes | Não | Não | Sim | — | No MVP, item genérico com agrupador; entidade própria só se houver catálogo reutilizável. |
| Serviços/equipamentos/equipe/transporte | Não | Patrimônio cobre ativos, não locação/custo | Sim | `Product` `ASSET` apenas como referência opcional | Tipos de item/custo no orçamento, sem movimentar estoque automaticamente. |
| Ficha técnica | Sim | — | Não | `Recipe`, `RecipeItem` | Reutilizar e versionar no snapshot do orçamento. |
| Subfichas | Sim no consumo | Custo exibido não é recursivo | Ajuste | `Product(PRODUCTION)`, `Recipe` | Um motor recursivo único para custo e necessidade. |
| Conversão de unidade | Não robusta | Sim, strings + `packQuantity` | Ajuste | `Product` | Criar dimensão/fator validados e snapshot. |
| Consolidação de ingredientes | Sim em vendas | Não persiste planejamento | Ajuste | lógica de vendas | Serviço puro + `EventRequirement`. |
| Estoque disponível | Sim | Não considera reserva | Ajuste | `ProductStock` | Disponível = físico - reservas ativas. |
| Reserva para evento | Não | Não | Sim | `ProductStock`, `StockLocation` | Ledger `EventInventoryReservation`; sem alterar saldo físico ao reservar. |
| Necessidade líquida | Não | Sugestão por mínimo/consumo | Sim | `purchaseSuggestionService` | Bruta - estoque reservável/alocado + política de segurança. |
| Arredondamento por embalagem | Sim em sugestão | Não por evento | Ajuste | `packQuantity` | `ceil(necessidadeBase / conteúdoEmbalagem)`. |
| Fornecedores | Sim | — | Não | `Supplier`, `ProductSupplier` | Reutilizar. |
| Comparação de fornecedor | Sim | Sem rodada de cotação | Ajuste | histórico/ofertas | MVP usa oferta atual; cotação formal é fase posterior. |
| Cotação persistida | Não | Comparação e PDF apenas | Sim, se requisito inclui respostas formais | `SupplierCatalogItem` | Nova rodada/proposta somente em fase 2; não chamar comparação atual de cotação. |
| Ordem de compra | Sim | Sem vínculo com evento | Ajuste | `PurchaseOrder`, `PurchaseOrderItem` | Alocação N:N entre item comprado e evento. |
| Recebimento/entrada | Sim | Sem destino evento/reserva | Ajuste | nota, movimentos, estoque | Atualizar alocações e disponibilidade no recebimento. |
| Orçamento versionado | Não | Não | Sim | — | `EventBudget` imutável por revisão. |
| Snapshot aprovado | Não | Movimentos e itens de compra têm snapshots parciais | Sim | padrões de `PurchaseOrderItem`/`StockMovement` | Congelar ficha, quantidades, custos, preços e premissas. |
| Margem e preço recomendado | Não | `salePrice` e margem financeira pós-venda | Sim | fórmulas de relatório | Simulador e política clara de margem versus markup. |
| Previsto × realizado | Não | Relatórios agregados por período | Sim | movimentos, compras, vendas | Vínculos explícitos ao evento e categorias de custo. |
| Cancelamento | Não | Status em ordens/evento de consumo | Sim | padrão de status | Liberar reservas e tratar compras comprometidas. |
| Devolução de sobras | Sim no evento de marketing | Não ligada a evento comercial | Ajuste | `ConsumptionEvent`, `addStock` | Checkin operacional ligado ao `Event`. |
| Relatório/PDF comercial | Não | Vários geradores PDF | Sim | PDFKit/jsPDF | Template versionado do orçamento e fechamento. |
| Permissões de evento | Não | RBAC genérico | Sim | `requireRole` | Definir vender/aprovar/operar/fechar/ver margem. |

## 4. Arquitetura proposta

### 4.1 Limite do módulo

```text
Events API
├─ EventCommercialService
│  ├─ cliente, agenda, status
│  ├─ orçamento/revisões/snapshot
│  └─ preço, margem e aprovação
├─ EventPlanningService
│  ├─ RecipeExplosionService (puro, recursivo)
│  ├─ UnitConversionService
│  ├─ CostResolver + snapshot
│  ├─ RequirementConsolidator
│  └─ InventoryAvailability/ReservationService
├─ EventProcurementService
│  ├─ fornecedores/ofertas atuais
│  ├─ necessidade líquida e embalagens
│  └─ PurchaseOrder + alocações
└─ EventClosingService
   ├─ consumo/retorno/perda
   ├─ custos reais e receita
   └─ previsto × realizado
```

As funções de explosão, custo e conversão devem ser únicas e chamadas por orçamento, vendas, produção e eventos. Hoje existem versões próximas em `salesController`, `stockMovementService`, `recipeService` e `productionService`; copiar mais uma criaria divergência.

### 4.2 Entidades mínimas recomendadas

São propostas oito entidades. `EventBudget` representa a própria versão, evitando uma tabela separada `EventBudgetVersion`.

#### `EventCustomer`

- `id`, `organizationId` ou `establishmentId`, nome/razão social, documento, e-mail, telefone, observações, timestamps.
- Reutilizável entre eventos.
- O evento também guarda um `customerSnapshot` mínimo para preservar o nome/dados do contrato aprovado.

#### `Event`

- `id`, `establishmentId`, `customerId`, nome, data/hora inicial/final, local/endereço, convidados, status, notas, responsável, timestamps.
- Status sugeridos: `DRAFT`, `QUOTING`, `APPROVED`, `PLANNING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.
- Relaciona orçamentos, reservas, requisitos, custos reais e movimentos/alocações.

#### `EventBudget`

- Uma linha por revisão: `eventId`, `revision`, `parentBudgetId`, status (`DRAFT`, `SENT`, `APPROVED`, `REJECTED`, `SUPERSEDED`).
- Premissas: convidados, margem desejada, impostos/comissões percentuais, desconto, receita/preço recomendado e negociado.
- Totais congelados: custo de insumos, equipe, serviço, equipamento, transporte, outros, custo total, lucro, margem, CMV e custo/convidado.
- `calculationPolicyVersion`, `approvedAt/by`, `validUntil`, observações.
- Uma revisão aprovada é imutável. Alteração cria nova revisão; nunca recalcula a anterior.

#### `EventBudgetItem`

- Item genérico com `type`: `PRODUCT`, `RECIPE`, `PACKAGE`, `SERVICE`, `EQUIPMENT`, `STAFF`, `TRANSPORT`, `FEE`, `TAX`, `OTHER`.
- Referências opcionais ao `Product`; descrição, quantidade, unidade, custo unitário/total, preço unitário/total, markup/margem e ordem/grupo.
- `sourceSnapshot` JSON: nome, receita completa expandida, rendimento, unidade/conversão, preço/custo e data/origem usados.
- `pricingMode` e metadados específicos em JSON apenas para variação periférica. Valores financeiros importantes continuam em colunas decimais.
- Pacotes do MVP podem ser agrupadores/itens com filhos ou `groupKey`; criar catálogo `EventPackage` somente quando houver reutilização real.

#### `EventRequirement`

- Resultado consolidado e reproduzível do orçamento aprovado: `eventId`, `budgetId`, `productId`, `locationId` opcional.
- Quantidade bruta base, saldo considerado, reservado, necessidade líquida, conteúdo da embalagem, embalagens a comprar, excesso projetado, custo e fornecedor sugerido.
- Guarda snapshot de unidade/conversão/custo e a origem dos itens em JSON.
- É regenerável enquanto rascunho; ao aprovar, congela a versão correspondente.

#### `EventInventoryReservation`

- Ledger por evento/produto/local: quantidade base, status (`ACTIVE`, `CONSUMED`, `RELEASED`, `EXPIRED`), validade e timestamps.
- Reserva não altera `ProductStock`; disponibilidade é `saldo físico - soma de reservas ACTIVE`.
- Consumo converte reserva em movimento/estado consumido de forma atômica.

#### `EventCost`

- Custo **real** que não chega automaticamente por estoque/compra: `eventId`, `budgetItemId` opcional, categoria, descrição, quantidade, valor unitário/total, fornecedor/prestador, competência, status, documento/referência e autor.
- Insumos reais devem vir prioritariamente de `StockMovement`; compras de `PurchaseOrderItem`; `EventCost` evita duplicar esses valores.

#### `EventPurchaseAllocation`

- Junção entre `Event`, `EventRequirement` e `PurchaseOrderItem` com quantidade e valor alocados.
- Necessária porque uma compra pode servir a vários eventos e um evento pode receber várias compras.
- Impede atribuir 100% da mesma compra a mais de um evento e suporta estorno/devolução proporcional.

### 4.3 Alterações pequenas em entidades atuais

- `StockMovement.eventId` opcional para custo/consumo/retorno/perda rastreável.
- `Sale.eventId` opcional e único quando a receita do evento for registrada como venda.
- Não é obrigatório adicionar `eventId` direto a `PurchaseOrder`; a alocação nos itens é mais correta para compras compartilhadas.
- Avaliar `Product.unitDimension` e fator base versionável. Antes disso, bloquear conversões incompatíveis.
- Adicionar índices por `eventId`, data/status e combinações de reserva produto/local/status.

## 5. Regras de cálculo

### 5.1 Explosão de cardápio

Para cada item de cardápio:

```text
quantidade final solicitada
  -> se INVENTORY: converter para unidade-base
  -> se PRODUCTION: multiplicar RecipeItem.quantity / Recipe.yieldQuantity
  -> repetir recursivamente para subpreparações
  -> detectar ciclo por ancestry
  -> consolidar por Product + unidade-base + local/política de origem
```

No planejamento bruto, não consumir automaticamente estoque pronto de preparações. Primeiro calcular demanda total. Depois uma política explícita decide quanto será atendido por produto pronto reservado e quanto será produzido/explodido. Isso evita resultados dependentes da ordem de iteração.

### 5.2 Necessidade líquida e embalagem

```text
disponível = ProductStock.quantity - outras reservas ACTIVE
atendido_por_estoque = min(necessidade_bruta, disponível elegível)
necessidade_líquida = max(0, necessidade_bruta - atendido_por_estoque)
embalagens = ceil(necessidade_líquida / conteúdo_da_embalagem)
quantidade_a_comprar_base = embalagens × conteúdo_da_embalagem
sobra_projetada = quantidade_a_comprar_base - necessidade_líquida
```

Reserva deve usar local. Usar apenas `Product.quantity` permitiria prometer estoque que está em outro local ou já reservado.

### 5.3 Custo estimado

Política sugerida por prioridade configurável e registrada no snapshot:

1. preço de fornecedor escolhido e vigente;
2. melhor oferta local válida;
3. última compra recebida;
4. `currentCost`;
5. custo zero somente com alerta bloqueante para aprovação.

Para estoque existente, decidir e registrar se a avaliação usa custo histórico/médio, custo atual ou custo de reposição. Para orçamento comercial, custo de reposição costuma ser mais seguro; para realizado, usar o `unitCost` do movimento.

### 5.4 Preço recomendado

“Margem de 30%” deve significar margem sobre receita, não acréscimo de 30%:

```text
preço = custo / (1 - margem_desejada)
```

Exemplo: custo R$ 6.000 e margem 30% => preço recomendado R$ 8.571,43; lucro R$ 2.571,43.

Se comissão, imposto e taxa são percentuais da receita:

```text
preço = custos_fixos / (1 - margem - comissão% - impostos% - taxas%)
```

Bloquear soma percentual >= 100%. Se o produto quiser “markup”, exibi-lo separadamente: `preço / custo`; nunca rotular markup como margem.

### 5.5 Previsto × realizado

| Dimensão | Previsto | Realizado |
|---|---|---|
| Insumos | `EventRequirement`/snapshot | movimentos com `eventId`, líquidos de retornos |
| Compras | quantidade/custo planejado | `EventPurchaseAllocation`, líquido de devoluções |
| Equipe/serviços/transporte | `EventBudgetItem` | `EventCost` |
| Receita | preço aprovado/negociado | `Sale.netTotal` vinculada ou recebimentos futuros |
| Resultado | totais congelados | receita real - custos reais |

Mostrar variação absoluta, percentual e motivo ajustável por categoria.

## 6. Integrações necessárias

### Produtos/fichas

- Extrair um `RecipeExplosionService` sem dependência HTTP.
- Unificar o custo recursivo da ficha com o motor de planejamento.
- Snapshot deve conter árvore original e consolidação final para auditoria.

### Estoque

- Consulta de disponibilidade deve incluir reservas ativas.
- Aprovar orçamento e reservar precisa ser transação serializável ou usar atualização condicional para evitar overbooking.
- Checkout do evento cria movimentos e consome reservas; retorno cria entrada com o custo snapshot original.

### Compras

- Gerar itens agrupados por fornecedor e classificação, respeitando a regra atual de não misturar classificações em ordens automáticas.
- Criar `EventPurchaseAllocation` junto com os itens da ordem.
- No recebimento parcial, atualizar alocação/reserva sem considerar toda a ordem disponível.
- A comparação atual pode alimentar o MVP; rodada formal de cotação requer domínio novo.

### Vendas/financeiro

- Criar uma `Sale` do evento ou vínculo equivalente quando aprovado/faturado, preservando receita bruta, descontos e líquida.
- Não somar `EventCost` de insumo se o mesmo valor já veio de `StockMovement`/alocação.

### Documentos

- PDF de proposta deve indicar revisão, validade, convidados, escopo, exclusões, totais e termos.
- PDF aprovado deve referenciar o hash/ID da revisão; reimpressão usa snapshot, nunca dados atuais.

## 7. Fluxo completo proposto

```text
Novo orçamento
  ↓
Selecionar/criar EventCustomer
  ↓
Criar Event (data, horário, local, convidados, responsável)
  ↓
Criar EventBudget revisão 1 (DRAFT)
  ↓
Adicionar cardápio, produtos, pacotes, equipe, serviços e adicionais
  ↓
Explodir Recipe/RecipeItem recursivamente
  ↓
Consolidar EventRequirement em unidade-base
  ↓
Consultar ProductStock - reservas de outros eventos
  ↓
Simular reserva, necessidade líquida, embalagem, fornecedor e custo
  ↓
Calcular receita, lucro, margem, CMV e custo/convidado em tempo real
  ↓
Enviar proposta (SENT) e gerar PDF da revisão
  ↓
Ajustes? criar nova revisão; nunca sobrescrever revisão enviada/aprovada
  ↓
Aprovar EventBudget imutável
  ↓
Criar EventInventoryReservation atomicamente
  ↓
Gerar necessidades de compra remanescentes
  ↓
Comparar fornecedores / cotar
  ↓
Criar PurchaseOrder + EventPurchaseAllocation
  ↓
Receber compras -> estoque/local -> atualizar alocações
  ↓
Separar/produzir e fazer checkout para o evento
  ↓
Evento IN_PROGRESS -> movimentos com eventId
  ↓
Retornar sobras e registrar perdas, equipe, transporte e demais EventCost
  ↓
Registrar receita real e concluir evento
  ↓
Apurar previsto × realizado e liberar reservas residuais
```

## 8. Estados e invariantes

- Só um orçamento pode estar `APPROVED` como revisão vigente por evento.
- Revisão `APPROVED` é imutável; correção cria revisão sucessora com justificativa.
- Evento não entra em `PLANNING` sem orçamento aprovado.
- Reserva ativa nunca pode superar disponibilidade não reservada, salvo override explícito e auditado.
- Evento cancelado libera reservas; compras já emitidas não são apagadas, apenas desalocadas, reaproveitadas ou devolvidas.
- Evento `COMPLETED` não aceita novos movimentos/custos sem reabertura auditada.
- Toda quantidade possui unidade/dimensão e fator usados no cálculo.
- Todo custo previsto tem `asOf`, fonte e moeda; todo custo real aponta para origem única.

## 9. Riscos e controles

| Risco | Consequência | Controle recomendado |
|---|---|---|
| Dupla contagem entre `Product.quantity` e `ProductStock` | Disponível incorreto | `ProductStock` como fonte operacional; reconciliação e constraint/lógica transacional. |
| Dupla reserva concorrente | Dois eventos prometem o mesmo saldo | Transação serializável/lock lógico e ledger ACTIVE por local. |
| Unidades incompatíveis | Compra/receita errada | Dimensão (`MASS`, `VOLUME`, `COUNT`) + fator validado; proibir conversão cruzada. |
| Alterar `packQuantity` | Histórico e necessidade mudam | Snapshot de fator/unidades em orçamento, requisito, compra e recebimento. |
| Alterar custo/fornecedor | Orçamento antigo muda | Revisão imutável com custo, fonte, validade e fornecedor congelados. |
| Alterar ficha | Ingredientes antigos mudam | Snapshot da árvore da receita e rendimento na revisão. |
| Subficha cíclica | Loop/inconsistência | Detecção de ancestry no cadastro e no cálculo. |
| Estoque pronto de preparação | Explosão variável | Política em duas fases: demanda bruta, depois atendimento por pronto/produção. |
| Arredondamento de embalagem | Sobra/custo subestimado | `ceil`, registrar sobra projetada e quem absorve seu custo. |
| Compras compartilhadas | Custo duplicado | `EventPurchaseAllocation` com soma alocada <= recebido líquido. |
| Custos compartilhados | Resultado distorcido | Regra explícita de rateio, snapshot e auditoria. |
| Recebimento parcial/devolução | Evento parece abastecido sem estar | Estados de alocação e valores líquidos por item. |
| Cancelamento | Estoque bloqueado/compra órfã | Workflow de liberação, realocação e tratamento financeiro. |
| Sobras devolvidas | Consumo real superestimado | Retorno ao mesmo local/custo de saída e vínculo ao evento. |
| Perdas não registradas | CMV real subestimado | Fechamento exige conciliação retirado = retornado + consumido + perda. |
| Custo teórico versus real | Comparação falsa | Separar snapshot estimado de movimento/alocação real. |
| Margem confundida com markup | Preço abaixo do alvo | Fórmulas nomeadas, testes e apresentação conjunta. |
| Impostos/comissões percentuais | Circularidade no preço | Fórmula gross-up e validação da soma percentual. |
| Data/fuso | Evento/relatório no dia errado | Persistir UTC + timezone do estabelecimento; usar calendário operacional existente. |
| Permissões frouxas | Aprovação/fechamento indevido | Matriz de autorização de Eventos no backend, não só UI. |
| `ConsumptionEvent` homônimo | Acoplamento semântico | Renomear conceitualmente na UI ou tratá-lo como “checkout operacional”. |

## 10. MVP recomendado

### Escopo do MVP

1. Cliente e evento.
2. Orçamento revisável com produtos/receitas e custos adicionais genéricos.
3. Simulador de convidados, quantidades e margem.
4. Explosão recursiva consolidada e snapshot aprovado.
5. Disponibilidade por local e reserva.
6. Necessidade líquida, embalagem e sugestão de fornecedor.
7. Geração de ordem de compra com alocação ao evento.
8. Checkout/retorno de insumos e custos reais manuais.
9. Previsto × realizado e PDFs de proposta/fechamento.

### Fora do MVP

- CRM completo, contratos/assinatura eletrônica e cobrança parcelada.
- Escala detalhada/ponto de equipe.
- Catálogo reutilizável de pacotes e serviços.
- Cotação formal com convites e respostas de múltiplos fornecedores.
- Otimização automática multi-evento de compras e produção.
- Fiscal/contábil avançado.

## 11. Fases futuras

### Fase 2 — Cotação e operação avançada

- rodada formal de cotação, respostas do portal e adjudicação;
- catálogo de pacotes, serviços, equipamentos e perfis de equipe;
- cronograma de produção/separação/entrega;
- anexos, contratos e aceite digital;
- recebimentos parciais e contas a receber.

### Fase 3 — Planejamento multi-evento

- calendário de capacidade, conflito de equipe/equipamento/local;
- compra e produção consolidadas entre eventos;
- previsão de demanda e otimização de sobras;
- regras de rateio compartilhado e centros de custo.

### Fase 4 — Inteligência e integração

- rentabilidade por cliente, tipo de evento e cardápio;
- comparação de previsto × realizado com causas;
- recomendação de preço baseada em histórico;
- integrações fiscais, financeiras, CRM e agenda.

## 12. Ordem recomendada de implementação

1. Corrigir fundamentos compartilhados: unidade/conversão, fonte de saldo, motor único de explosão/custo e matriz de permissões.
2. Implementar `EventCustomer`, `Event`, `EventBudget` e `EventBudgetItem`, com revisão imutável e testes de pricing.
3. Implementar `EventRequirement` e snapshots recursivos.
4. Implementar disponibilidade e `EventInventoryReservation` com testes de concorrência.
5. Integrar compras por `EventPurchaseAllocation` e recebimentos/devoluções.
6. Integrar checkout/retorno, `StockMovement.eventId` e custos reais.
7. Implementar fechamento previsto × realizado, receita e PDFs.
8. Só então adicionar cotação formal, pacotes reutilizáveis e planejamento multi-evento.

## 13. Resumo final

- **Reuso aproximado:** 60–65% do MVP; maior no alicerce técnico do que no domínio comercial.
- **Principais entidades reutilizáveis:** `Product`, `Recipe`, `RecipeItem`, `ProductStock`, `StockLocation`, `StockMovement`, `Supplier`, `ProductSupplier`, `SupplierPriceHistory`, `PurchaseOrder`, `PurchaseOrderItem`, `PurchaseInvoice`, `Sale`, `establishments` e `UserEstablishment`.
- **Principais entidades novas:** `EventCustomer`, `Event`, `EventBudget`, `EventBudgetItem`, `EventRequirement`, `EventInventoryReservation`, `EventCost` e `EventPurchaseAllocation`.
- **Maiores riscos:** unidade/conversão textual, saldo global duplicado, reserva concorrente, snapshot incompleto, custo recursivo divergente, compras compartilhadas e confusão margem/markup.
- **Sequência crítica:** normalizar motores de cálculo -> orçamento/snapshot -> requisitos/reserva -> compras -> execução -> reconciliação.
