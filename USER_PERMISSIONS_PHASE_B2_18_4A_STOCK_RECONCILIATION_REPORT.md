# BASTIDOR OS — B2.18.4A: Reconciliação local de estoque e transferências

> Data: 11 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> Base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **reconciliação local concluída; sem banco, reparação, staging, commit ou operação remota**

## 1. Resultado executivo

A reconciliação de estoque foi concluída no worktree isolado. A única diferença funcional de runtime incorporada foi a validação de que o local de estoque pertence ao estabelecimento ativo antes de qualquer entrada ou saída alterar saldos. Essa proteção foi aplicada tanto em `consumeProduct` quanto em `addStock`.

O serviço de transferências, o utilitário de conversão e seu teste já continham a implementação funcional correta na base. As diferenças em relação ao working tree original eram exclusivamente comentários, indentação e linhas em branco; por isso, os arquivos da base foram preservados.

O script histórico de reparação foi inspecionado antes da cópia. Ele contém operações destrutivas quando executado diretamente com `--apply`, mas possui entrypoint protegido por `require.main === module`. O teste importa somente `buildPlan` e trabalha com fixtures em memória. Script e teste foram copiados byte a byte; o script de reparação **não foi executado**.

Resultados:

- 18 testes autorizados de estoque/conversão/reparação aprovados;
- 12 testes locais adicionais, previamente inspecionados e mockados/puros, aprovados;
- 45 testes de regressão B2.18.3 aprovados;
- **75 testes aprovados no total, zero falhas**;
- schema válido e hash preservado;
- 60 migrations preservadas, sem duplicatas;
- autorização LEGACY e isolamento multi-tenant mantidos.

Decisão: **GO condicionado para iniciar a B2.18.4B somente após nova autorização; NO-GO para reparação, banco, staging, commit ou deploy.**

## 2. Gates iniciais

| Gate | Resultado |
|---|---|
| Worktree/branch/HEAD | Confirmados |
| HEAD | `251d45bee486fc1af41e6ba2cff5ccc896dafc56` |
| Migrations | 60 |
| Schema | Válido; hash B2.18.1 preservado |
| Autorização | LEGACY por padrão; flags desativadas nos testes |
| B2.18.1–B2.18.3 | Artefatos presentes e staging vazio |
| Working tree original | Branch, HEAD, 243 entradas preexistentes e índice preservados |

Identidade final do working tree original:

```text
branch: feat/user-permissions-migration-plan
HEAD:   288de0c86262bb4a1602a418bf5b36060cbe3ddf
staged: 0
```

## 3. Classificação da allowlist

| Arquivo | Resultado da comparação | Tratamento |
|---|---|---|
| `src/services/stockMovementService.js` | Diferença funcional de isolamento | Merge seletivo |
| `src/services/stockTransferService.js` | Somente comentário | Base preservada |
| `src/utils/stockTransferConversion.js` | Somente comentário/indentação | Base preservada |
| `test/stockTransferConversion.test.js` | Somente linhas em branco | Base preservada |
| `test/stockMovementService.test.js` | Nova cobertura multi-tenant | Merge seletivo |
| `test/stockLocationRepair.test.js` | Ausente na base | Cópia byte a byte |
| `scripts/repair-park-stock-locations.js` | Ausente na base; autorização complementar | Cópia byte a byte após inspeção |

Nenhum arquivo de reservas, ocupações, billing, schema, migration ou dependência foi alterado nesta subetapa.

## 4. Diferença funcional reconciliada

Foi adicionada uma pré-condição comum:

```text
stockLocation.findFirst({ id: locationId, establishmentId })
```

Se o local não pertencer ao estabelecimento, a operação falha com status lógico `422` antes de:

- criar ou atualizar `productStock`;
- alterar o saldo global do produto;
- registrar `stockMovement`;
- calcular ou propagar efeitos de produção.

A validação cobre:

1. local informado explicitamente;
2. local padrão do produto;
3. local padrão encontrado para o estabelecimento.

O escopo existente por `product.id + establishmentId`, saldo local, saldo global e histórico de movimentação foi mantido.

## 5. Transferências e conversões preservadas

O serviço da base já confirma:

- origem e destino pertencentes à mesma organização;
- escopo por estabelecimento ao criar, listar, aprovar e rejeitar;
- produto de destino pertencente ao estabelecimento receptor;
- snapshot e recálculo controlado de conversão;
- débito na origem e crédito no destino via serviços de movimentação;
- criação de registros de histórico para os dois lados;
- validação de unidades e quantidades indivisíveis.

Não houve alteração funcional nesses arquivos:

| Arquivo preservado | SHA-256 |
|---|---|
| `stockTransferService.js` | `7fe14598d846f0b8730233130f400be37098335efb8fc3435721c292cd014bdc` |
| `stockTransferConversion.js` | `02077825aa8c31162e6091fcfd1a6b0e03027305c6bd8924bb8f9907d257cfab` |
| `stockTransferConversion.test.js` | `618c4e68782381929fa11c9acb9b5733775860d4bb400ddbc174fc775c076185` |

## 6. Inspeção do script de reparação

### Dependências e configuração

O script importa:

- `dotenv`;
- `fs`;
- `path`;
- `PrismaClient` e `Prisma.Decimal` de `@prisma/client`.

Ele não lê uma variável pelo nome diretamente, mas `dotenv.config()` pode carregar `.env`, e o Prisma Client usa o datasource configurado por `DATABASE_URL` quando uma operação de banco é iniciada.

### Efeitos ao importar

Ao importar o módulo:

- `dotenv.config()` lê configuração local se ela existir;
- um `PrismaClient` lazy é instanciado;
- constantes e funções são definidas;
- `buildPlan` é exportada.

Não são executados no import:

- `$connect`;
- `$transaction`;
- consultas Prisma;
- leitura ou escrita de backup;
- lock de tabela;
- `UPDATE`, `DELETE` ou auditoria;
- `main()`.

O entrypoint está protegido por:

```text
if (require.main === module) main()...
```

### Efeitos da execução direta — proibida nesta etapa

Sem `--apply`, a execução direta ainda consultaria o banco e gravaria um snapshot no filesystem.

Com `--apply`, o script:

- abre transação;
- bloqueia tabelas com `SHARE ROW EXCLUSIVE`;
- atualiza saldo de destino;
- exclui o saldo na localização incorreta;
- atualiza movimentos;
- cria registros de auditoria;
- grava resultado no filesystem.

Portanto, o script é operacionalmente perigoso e não deve ser chamado sem autorização específica, backup revisado, identidade de banco confirmada e janela de manutenção.

### Segurança do teste

`stockLocationRepair.test.js` importa somente `buildPlan`. Seus três casos usam objetos literais em memória e `Prisma.Decimal`; não chamam `main`, `snapshot`, Prisma ou filesystem.

Hashes de origem e destino:

| Arquivo | SHA-256 |
|---|---|
| `repair-park-stock-locations.js` | `24907a0a379c50dc56dbdcf2d8a4d9ee5ee115fde7d4cd914d226c4e1e75c80f` |
| `stockLocationRepair.test.js` | `912cf82ec2c25744e7cc85604108f69a0a9a216501938cb85dff061620cb5702` |

Ambos coincidem byte a byte com a origem.

## 7. Arquivos modificados nesta subetapa

| Arquivo | Estado | SHA-256 final |
|---|---|---|
| `backend/src/services/stockMovementService.js` | Merge seletivo | `36f157ae67856bb935cccd12e8437060e6170286f64814dc3535d155a021861e` |
| `backend/test/stockMovementService.test.js` | Merge seletivo | `e175245c5f65325f83b662a5749f40a06b2c72b0123d2dec6647f1612923aff5` |
| `backend/scripts/repair-park-stock-locations.js` | Novo, cópia exata | `24907a0a379c50dc56dbdcf2d8a4d9ee5ee115fde7d4cd914d226c4e1e75c80f` |
| `backend/test/stockLocationRepair.test.js` | Novo, cópia exata | `912cf82ec2c25744e7cc85604108f69a0a9a216501938cb85dff061620cb5702` |
| `USER_PERMISSIONS_PHASE_B2_18_4A_STOCK_RECONCILIATION_REPORT.md` | Novo relatório | Calculado na verificação final |

## 8. Testes executados

Todas as execuções usaram `DATABASE_URL` para porta inválida em loopback, flags PROFILED desativadas e nenhuma credencial Stripe. A segurança não dependeu apenas dessa URL: os testes foram inspecionados e usam mocks, funções puras ou transações falsas.

### Estoque, conversão e reparação

```text
stockMovementService.test.js
stockTransferConversion.test.js
stockLocationRepair.test.js
```

Resultado: **18 aprovados, zero falhas**.

Cobertura principal:

- entrada e saída;
- rejeição de local pertencente a outro estabelecimento;
- invariância dos saldos quando a pré-condição falha;
- produção pronta e explosão recursiva de ingredientes;
- detecção de ciclos;
- proteção contra saldo negativo;
- classificação e histórico;
- conversão por embalagem e unidade base;
- rejeição de conversão ambígua, fator zero e fração indivisível;
- plano de reparação puro, reconciliação e falha fechada.

### Testes locais complementares inspecionados

```text
stockMovementValidation.test.js
stockMovementPagination.test.js
stockAuditController.test.js
```

Resultado: **12 aprovados, zero falhas**.

Esses testes usam validações puras e doubles em `require.cache`; não acessam banco.

### Regressão B2.18.3

Foram reexecutados os oito arquivos da regressão de autorização/billing.

Resultado: **45 aprovados, zero falhas**, incluindo paridade das 183 rotas internas e modo LEGACY.

### Total

```text
75 aprovados
0 falhas
0 cancelados
0 ignorados
```

## 9. Integridade final

| Verificação | Resultado |
|---|---|
| `node --check` nos sete arquivos da allowlist ampliada | Aprovado |
| `git diff --check` | Aprovado |
| `prisma validate` com loopback inválido | Aprovado, sem conexão |
| Schema SHA-256 | `47b44778697099f55625d02c9b98dfb3f0d3bf93ebf716787425d5ae705ce8af` |
| Migrations | 60 |
| Nomes duplicados | Zero |
| Staging | Vazio |
| Execução do reparo | Não executada |
| Working tree original | Preservado |

Nenhuma migration ou `schema.prisma` foi alterado nesta subetapa.

## 10. Riscos e conflitos

| Criticidade | Item | Tratamento |
|---|---|---|
| Crítica | Script de reparação contém lock, update e delete | Nunca executar sem autorização operacional específica |
| Crítica | Credencial PostgreSQL exposta continua pendente | Rotacionar antes de qualquer operação remota |
| Alta | B2.14 ainda pendente | Auditar história e estado real antes de aplicar migrations |
| Alta | Replay das 60 migrations pendente | Validar em PostgreSQL descartável em etapa autorizada |
| Média | Validação nova adiciona uma leitura de catálogo por entrada/saída | Avaliar custo em fluxos de lote; permanece dentro da transação |
| Média | Conversão não possui teste integrado com banco | Cobertura atual é unitária; replay e integração permanecem pendentes |
| Média | Script contém identificadores fixos de incidente | Mantê-lo como artefato histórico, não ferramenta genérica |

## 11. Restrições respeitadas

- nenhuma conexão com Supabase, Render ou Stripe;
- nenhuma execução direta do script de reparação;
- nenhuma migration, seed, replay, backfill ou SQL;
- nenhuma alteração no working tree original;
- nenhuma modificação fora da allowlist ampliada e deste relatório;
- nenhuma alteração de billing, reservas, ocupações, schema ou migrations;
- nenhum `git add`, commit, push, merge, rebase ou cherry-pick;
- nenhuma ativação PROFILED;
- nenhum deploy ou Fase C.

## 12. GO/NO-GO

### GO condicionado

- aceitar a validação multi-tenant de locais de estoque;
- aceitar a preservação da implementação remota de transferências e conversões;
- aceitar script e teste de reparação como artefatos locais, sem autorizar execução;
- aceitar os 75 testes locais como evidência da B2.18.4A;
- iniciar a B2.18.4B somente após autorização explícita e nova allowlist.

### NO-GO

- executar `repair-park-stock-locations.js`, inclusive em modo preview;
- conectar a banco remoto ou real;
- executar migration, seed, replay ou backfill;
- staging, commit, push ou deploy;
- alterar reservas/ocupações sem B2.18.4B autorizada;
- ativar PROFILED ou iniciar a Fase C.

Execução encerrada no limite autorizado da B2.18.4A. Aguardando revisão.
