# Devoluções ao fornecedor

A tela **Movimentação → Devolução ao fornecedor** permite escolher produto, compra recebida, local, quantidade na unidade de estoque, data, motivo e tratamento financeiro previsto. O histórico exibe as últimas 50 devoluções; os registros também permanecem no histórico geral e nos relatórios.

## Regras

- Somente administradores podem consultar e registrar devoluções pela API específica.
- A compra deve estar concluída e pertencer ao estabelecimento autenticado, assim como produto, fornecedor e local.
- Quantidades aceitam até três casas decimais. O limite é a quantidade recebida menos todas as devoluções anteriores, além do estoque disponível no local e no saldo global.
- O recebimento passa a preservar quantidade convertida, custo e unidade. Alterações posteriores na embalagem ou custo atual não alteram o valor da devolução.
- A saída sempre retira o produto físico. Não consome ingredientes de receitas nem atualiza o custo corrente do produto.
- Estoque local, saldo global, movimentação, devolução e auditoria são gravados em uma transação serializável, com repetição limitada em conflitos. `requestId` evita duplicação no reenvio da mesma solicitação; reutilizá-lo com dados diferentes é rejeitado.
- A data fica entre o recebimento e o dia atual em São Paulo. A movimentação usa a data operacional; `PurchaseReturn.createdAt` mantém o instante do registro.
- Compras concluídas não podem ser excluídas pelo serviço de ordens. A devolução mantém o documento original e tem vínculo protegido contra exclusão no banco.

## Compras antigas

Quando faltam os novos campos, a quantidade é recuperada da movimentação de compra original. A busca exige mesmo estabelecimento e produto, referência da ordem, intervalo entre criação e conclusão, um único item do produto na ordem e uma única movimentação com valor compatível. Casos sem correspondência segura aparecem indisponíveis. Não se aplica a embalagem atual para inventar a conversão antiga.

## Relatórios e financeiro

Os relatórios consideram **compras líquidas = compras brutas − devoluções**, cada evento na própria data. Uma devolução de compra antiga pode produzir compras líquidas negativas em um período sem novos recebimentos. Ela não entra como consumo, venda ou perda, inclusive no painel inicial. O relatório por produto mantém a compra original e acrescenta uma linha negativa para a devolução.

O tratamento financeiro (`PENDING`, `PAYABLE_REDUCTION`, `SUPPLIER_CREDIT`, `REFUND`) indica o acerto previsto. Não movimenta caixa, não confirma reembolso, não altera `netPaidAmount` da nota e não recalcula bonificações de acordos comerciais. Estes continuam seguindo seu fluxo próprio.

## API

- `GET /api/stock-movements/return-receipts?productId=<uuid>`: compras do produto com saldo devolvível, custo original e eventual impedimento.
- `GET /api/stock-movements/supplier-returns`: últimas 50 devoluções do estabelecimento.
- `POST /api/stock-movements/supplier-returns`: `purchaseOrderItemId`, `locationId`, `requestId`, `quantity`, `returnedAt` (`YYYY-MM-DD`), `reason` (`CONSIGNMENT_RETURN` ou `SUPPLIER_RETURN`), `financialTreatment`, `notes` opcional.

## Instalação e validação

Aplicar a migração `20260920120000_purchase_returns` antes de iniciar o backend atualizado:

```powershell
cd backend
npm.cmd run db:deploy
npm.cmd run db:generate
```

O arquivo de migração não altera saldos nem ordens existentes. Sua aplicação no banco configurado não é executada pelos testes automatizados.

```powershell
cd backend
npm.cmd test
cd ..
npm.cmd run test:stock-movement
npm.cmd run build
```

Os testes de serviço usam transações simuladas com rollback. Cobrem custo original, conversão, baixa física, saldo local/global, limite acumulado, idempotência, isolamento, datas, conflito serializável e identificação de compras antigas. Validar a migração e concorrência real em PostgreSQL de homologação antes da publicação.
