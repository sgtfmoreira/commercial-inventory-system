# BASTIDOR OS — B2.18.4B: Plano de reconciliação de reservas e ocupações

> Data: 11 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> Base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **análise e planejamento concluídos; nenhum código copiado ou alterado**

## 1. Resultado executivo

A implementação publicada e a implementação desenvolvida são complementares, mas não podem ser conciliadas por cópia integral.

A base do worktree contém:

- criação em lote de reservas;
- agrupamento por `reservationGroupId`;
- criação em lote de ocupações;
- agrupamento por `occupancyGroupId`;
- atualização, cancelamento e liberação atômicos de grupos;
- interface responsiva com seleção múltipla de mesas.

O working tree original contém:

- check-in de reservas;
- `checkedInAt` e `checkedInByUserId`;
- vínculo único `TableOccupancy.reservationId`;
- métricas de ocupação por período;
- interface de check-in e indicadores.

As duas linhas removem funcionalidades uma da outra quando comparadas diretamente. A estratégia correta é manter a base como fonte e incorporar check-in/métricas de forma aditiva, tornando check-in, cancelamento, edição e liberação conscientes de grupos.

Foram identificados **18 arquivos candidatos à futura allowlist**. Não é necessária nova dependência npm. Schema e seis migrations relacionadas já estão reconciliados e devem permanecer imutáveis.

Decisão: **GO condicionado para executar a reconciliação somente após aprovação da allowlist e das regras de grupo descritas neste plano. NO-GO para copiar a versão original sobre a base.**

## 2. Gates verificados

| Gate | Resultado |
|---|---|
| Worktree | Caminho isolado confirmado |
| Branch | `integration/bastidor-permissions-b2` |
| HEAD | `251d45bee486fc1af41e6ba2cff5ccc896dafc56` |
| Migrations | 60, zero nomes duplicados |
| Schema | Válido |
| Schema SHA-256 | `47b44778697099f55625d02c9b98dfb3f0d3bf93ebf716787425d5ae705ce8af` |
| LEGACY | Preservado; flags continuam opt-in |
| Staging | Vazio |
| B2.18.1–B2.18.4A | Relatórios e alterações isoladas presentes |
| Working tree original | `feat/user-permissions-migration-plan` em `288de0c86262`; 243 entradas preexistentes; zero staged |

A única validação Prisma executada foi `prisma validate` com datasource forçado para loopback inválido. Não houve banco, migration, seed ou teste nesta etapa.

## 3. Estruturas já reconciliadas

### Schema Prisma

`TableReservation` já contém simultaneamente:

- `reservationGroupId`;
- `checkedInAt`;
- `checkedInByUserId` e relação com `users`;
- relação opcional `occupancy`.

`TableOccupancy` já contém simultaneamente:

- `occupancyGroupId`;
- `reservationId @unique`;
- relação opcional com `TableReservation`;
- índice por `establishmentId, seatedAt`.

### Migrations preservadas

| Migration | Responsabilidade |
|---|---|
| `20261019120000_add_table_reservations` | Reserva, FKs e unicidade parcial de mesa/data ativa |
| `20261020193000_add_table_occupancies` | Ocupação, FKs e unicidade parcial de mesa ativa |
| `20261020220000_group_table_reservation_guests` | `reservationGroupId` e agrupamento histórico |
| `20261021150000_add_table_occupancy_metrics_index` | Índice de métricas por estabelecimento/data |
| `20261023120000_link_reservation_check_in` | Check-in, responsável e vínculo reserva–ocupação |
| `20261030193000_group_table_occupancies` | `occupancyGroupId` |

Nenhuma dessas migrations ou o schema deve ser alterado na execução B2.18.4B.

## 4. Inventário backend

### Matriz funcional

| Arquivo | Base atual | Working tree original | Classificação | Estratégia |
|---|---|---|---|---|
| `backend/src/controllers/tableReservationController.js` | `createBatch` | `checkIn` | Compartilhado, merge manual | Exportar e atender ambos |
| `backend/src/controllers/tableOccupancyController.js` | `createBatch` | `metrics` e validação de query | Compartilhado, merge manual | Preservar batch e adicionar metrics |
| `backend/src/repositories/tableReservationRepository.js` | Busca/atualização de grupos | Check-in, vínculo e ocupação | Compartilhado, merge manual | Unir APIs e endurecer operações de grupo |
| `backend/src/repositories/tableOccupancyRepository.js` | Busca/criação/liberação de grupos | Métricas e vínculo de reserva | Compartilhado, merge manual | Unir APIs e filtros tenant |
| `backend/src/services/tableReservationService.js` | Lote, resumo e edição/cancelamento de grupo | Check-in unitário | Conflito funcional | Check-in atômico do grupo e preservação dos fluxos publicados |
| `backend/src/services/tableOccupancyService.js` | Lote, resumo e liberação de grupo | Métricas | Conflito funcional | Manter grupos e tornar métricas group-aware |
| `backend/src/routes/tableReservationRoutes.js` | `/batch` | `/:id/check-in` | Compartilhado, merge manual | Preservar os dois contratos |
| `backend/src/routes/tableOccupancyRoutes.js` | `/batch` | `/metrics` | Compartilhado, merge manual | Preservar os dois contratos e ordem estática |
| `backend/src/validations/tableReservationValidation.js` | Schema batch | Schema check-in | Compartilhado, merge manual | Exportar ambos |
| `backend/src/validations/tableOccupancyValidation.js` | Schema batch | Query de métricas | Compartilhado, merge manual | Exportar ambos |
| `backend/test/tableReservationService.test.js` | Cobertura de grupos | Cobertura de check-in | Compartilhado, merge manual | Combinar e adicionar cenários cruzados |
| `backend/test/tableOccupancyService.test.js` | Cobertura de grupos | Cobertura de métricas | Compartilhado, merge manual | Combinar e validar agregação por grupo |
| `backend/test/tableReservationValidation.test.js` | Validação batch | Validação check-in | Compartilhado, merge manual | Combinar casos |
| `backend/test/legacyAuthorizationParity.test.js` | Inventário atual de 193/183 rotas | Mesma política, antes das rotas combinadas | Dependência adicional necessária | Atualizar contagens/snapshot após adicionar duas rotas |

Não há arquivo de runtime exclusivo em apenas um lado; as funcionalidades exclusivas estão dentro de arquivos compartilhados.

## 5. Inventário frontend

| Arquivo | Base atual | Working tree original | Classificação | Estratégia |
|---|---|---|---|---|
| `src/pages/TableReservations.js` | UI responsiva, multisseleção, agrupamento e batch | Check-in e métricas | Conflito funcional crítico | Manter a página da base e incorporar check-in/métricas seletivamente |
| `src/pages/TableReservations.test.js` | Seleção múltipla e utilitários | Utilitários sem batch | Compartilhado, merge manual | Preservar testes batch e adicionar check-in/métricas |
| `src/services/tableReservationService.js` | `createBatch` | `checkIn` | Compartilhado, merge manual | Expor ambos |
| `src/services/tableOccupancyService.js` | `createBatch` | `metrics` | Compartilhado, merge manual | Expor ambos |

### Arquivos de integração já suficientes

Os seguintes caminhos foram inspecionados, mas não precisam entrar na allowlist funcional:

- `src/App.js`: a rota `/table-reservations` já está registrada;
- `src/components/SidebarLayout.js`: navegação já existe e é limitada ao Commercial;
- `src/components/SidebarLayout.test.js`: cobertura de visibilidade já existe;
- `backend/src/app.js`: as duas famílias de rotas já estão montadas;
- `backend/src/constants/permissions.js`;
- `backend/src/constants/accessProfiles.js`;
- `backend/src/constants/legacyPermissionMap.js`: já reconhece `check-in`, `cancel`, leitura de métricas e execução/liberação;
- `backend/src/middlewares/requireEstablishment.js`;
- `scripts/table-reservations-jest.config.js`;
- `scripts/table-reservations-jest.setup.js`;
- `scripts/check-ui-components.js`;
- `package.json`.

Alguns desses arquivos diferem globalmente devido às integrações B2/billing ou à evolução da interface, mas suas partes relacionadas a reservas já são compatíveis. Eles devem ser preservados, não substituídos.

## 6. Dependências

### Dependências locais existentes

Backend:

- `../utils/prisma`;
- `../utils/AppError`;
- `node:crypto.randomUUID` para IDs de grupo;
- Express Router;
- `authMiddleware`, `requireRole`, `requireEstablishment`, `validate`;
- Zod;
- constantes de estabelecimento.

Frontend:

- React hooks;
- `styled-components`;
- `react-hot-toast`;
- `react-router-dom`;
- `react-icons`;
- componentes locais `Button`, `Modal`, `FormFields` e `Table`;
- `useApp`;
- cliente `api` existente.

Todas já constam no projeto. **Nenhuma alteração de `package.json`, lockfile ou instalação é necessária.**

### Dependências de dados

- índices parciais de reserva e ocupação ativas;
- unicidade de `TableOccupancy.reservationId`;
- FKs de usuário, estabelecimento e reserva;
- índices de grupo;
- índice de métricas por `establishmentId, seatedAt`.

Essas dependências deverão ser exercitadas posteriormente em PostgreSQL local descartável, mas não serão alteradas pela reconciliação de código.

## 7. Estratégia de merge manual

### 7.1 Reservas agrupadas

Preservar integralmente:

- `createBatch` com um único `reservationGroupId`;
- verificação prévia de conflitos para todas as mesas;
- transação única;
- `groupTableNumbers` no DTO;
- contagem de pessoas uma única vez por grupo;
- atualização e cancelamento do grupo inteiro;
- optimistic locking de todos os membros.

Adicionar a restrição de que nenhuma linha do grupo pode ser editada ou cancelada depois do check-in.

### 7.2 Check-in individual e de grupo

O check-in deve operar sobre:

```text
grupo = reservationGroupId ? todas as reservas CONFIRMED do grupo : [reserva]
```

Dentro de uma única transação:

1. buscar a reserva pelo `id + establishmentId`;
2. rejeitar cancelada, já conferida ou versão divergente;
3. buscar e validar todos os membros do grupo;
4. exigir mesma versão e ausência de `checkedInAt`/ocupação em todos;
5. exigir data atual de São Paulo igual à data da reserva;
6. verificar ausência de ocupação ativa em todas as mesas;
7. marcar todas as reservas como checked-in;
8. criar uma ocupação por mesa;
9. usar o mesmo `occupancyGroupId` quando houver múltiplas mesas;
10. vincular cada ocupação à respectiva reserva por `reservationId`;
11. retornar reservas e ocupações agrupadas.

Qualquer `P2002`, versão concorrente ou mesa ocupada deve reverter o grupo completo.

### 7.3 Edição e cancelamento

- manter atualização/cancelamento atômico do grupo;
- impedir alteração de `tableNumber` em reserva agrupada;
- incluir `checkedInAt: null` nos filtros versionados;
- verificar todos os membros antes da mutação;
- falhar fechado se apenas parte do grupo estiver inconsistente.

### 7.4 Ocupações

Preservar:

- walk-in individual;
- criação batch com `occupancyGroupId`;
- bloqueio quando qualquer mesa já está ativa;
- bloqueio de walk-in quando existe reserva confirmada ainda não conferida;
- liberação atômica do grupo;
- histórico e responsável pela liberação.

O vínculo com reserva não deve ser aceito do cliente em um walk-in; ele será criado somente pelo fluxo transacional de check-in.

### 7.5 Métricas group-aware

A implementação original conta cada linha como uma ocupação e como pessoas. Isso duplicaria pessoas e sessões quando `occupancyGroupId` estiver presente, porque a base grava o total do grupo em cada mesa.

Proposta:

- resumo de sessões, pessoas, origem reserva/walk-in e permanência: agrupar por `occupancyGroupId || id` e contar uma vez;
- giro por mesa: contar cada linha, pois cada mesa participou do atendimento;
- duração por grupo: calcular uma vez no resumo;
- métricas por mesa: indicar que `partySize` é tamanho do grupo, sem somar o mesmo grupo como pessoas distintas em um total global;
- sessões ainda abertas não entram na média de permanência.

O teste deve tornar explícito que a soma do campo `people` das mesas não é usada como total global quando uma sessão ocupa várias mesas.

### 7.6 Rotas

Contrato final proposto:

```text
GET    /api/table-reservations
POST   /api/table-reservations
POST   /api/table-reservations/batch
POST   /api/table-reservations/import/preview
POST   /api/table-reservations/import
POST   /api/table-reservations/:id/check-in
PATCH  /api/table-reservations/:id
POST   /api/table-reservations/:id/cancel

GET    /api/table-occupancies
GET    /api/table-occupancies/metrics
POST   /api/table-occupancies
POST   /api/table-occupancies/batch
POST   /api/table-occupancies/:id/release
```

Rotas estáticas (`batch`, `metrics`, `import`) devem permanecer antes das rotas parametrizadas. Todos os endpoints continuam protegidos por autenticação, papéis `ADMIN|MANAGER` e estabelecimento `COMMERCIAL`.

### 7.7 Frontend

Usar `TableReservations.js` do worktree isolado como base visual e funcional. Incorporar:

- filtros e painel de métricas;
- ação de confirmar chegada;
- estado visual checked-in;
- vínculo da ocupação com a reserva;
- rótulos “com reserva”/“walk-in”;
- atualização conjunta de reservas, ocupações e métricas.

Preservar:

- seleção múltipla;
- criação batch;
- visualização de `groupTableNumbers`;
- edição/cancelamento de grupo;
- abertura/liberação de ocupações agrupadas;
- responsividade e zoom publicados.

Para um grupo, a UI deve mostrar uma única ação de check-in e uma única ação de liberação, embora o backend mantenha uma linha por mesa.

## 8. Isolamento multi-tenant e autorização

Regras obrigatórias para cada repository call:

- toda busca ou mutação por ID inclui `establishmentId`;
- toda busca por grupo inclui `reservationGroupId|occupancyGroupId + establishmentId`;
- métricas incluem `establishmentId` e faixa temporal;
- reservas ligadas a ocupações devem pertencer ao mesmo estabelecimento;
- o cliente nunca fornece `establishmentId`, `checkedInByUserId`, `createdByUserId` ou `releasedByUserId`;
- IDs de usuário vêm de `req.user.userId`;
- nenhum endpoint deve aceitar `reservationId` arbitrário para criar ocupação.

Compatibilidade B2:

- o catálogo e o mapa legado já incluem capabilities de reservas/ocupações;
- GET de métricas permanece `read`;
- check-in/cancelamento e release permanecem `execute`;
- batch permanece `create`;
- os papéis LEGACY continuam `ADMIN|MANAGER`;
- PROFILED não será ativado durante integração ou teste.

A adição das rotas `check-in` e `metrics` deve aumentar o inventário atual em duas rotas. As contagens exatas precisam ser recalculadas pelo teste, não editadas por suposição.

## 9. Riscos de regressão

| Criticidade | Risco | Mitigação |
|---|---|---|
| Alta | Copiar a feature remove batch e agrupamentos publicados | Merge manual sobre a base |
| Alta | Copiar a base remove check-in e métricas | Portar seletivamente os novos fluxos |
| Alta | Check-in de apenas uma mesa de um grupo | Transação e validação de todos os membros |
| Alta | Métricas duplicarem pessoas de grupos | Agregação group-aware |
| Alta | Liberação parcial de ocupação agrupada | `releaseActiveGroupVersioned` e versões consistentes |
| Alta | Vínculo entre tenants | Sempre derivar reserva/estabelecimento no servidor |
| Alta | Corrida entre check-in, walk-in e outra sessão | Índices únicos + transação + mapeamento `P2002` |
| Média | Route shadowing de `/metrics` ou `/batch` | Registrar estáticas antes de parametrizadas |
| Média | UI permitir editar reserva já conferida | Estado readonly e falha fechada no backend |
| Média | Datas dependentes do UTC do servidor | Fronteiras explícitas de São Paulo |
| Média | Resumo contar grupo mais de uma vez | Deduplicar por group ID |
| Média | Inventário B2 ficar obsoleto | Reexecutar e revisar paridade de todas as rotas |

## 10. Testes existentes e classificação

| Teste | Classe | Acesso externo |
|---|---|---|
| `backend/test/tableReservationService.test.js` | Unitário com repository/database injetados | Não |
| `backend/test/tableOccupancyService.test.js` | Unitário com repository/database injetados | Não |
| `backend/test/tableReservationValidation.test.js` | Unitário puro Zod | Não |
| `src/pages/TableReservations.test.js` | Jest/jsdom, utilitários puros | Não |
| `backend/test/legacyAuthorizationParity.test.js` | Inspeção estática de rotas/políticas | Não |

Os módulos de service importam o Prisma Client padrão, mas os testes usam dependências injetadas e não chamam o cliente real. Na execução futura, usar `DATABASE_URL` de loopback inválido e arquivos explícitos; não executar `npm test` amplo sem nova inspeção.

### Cobertura adicional obrigatória

Backend:

- createBatch de reservas e ocupações continua atômico;
- check-in de reserva simples;
- check-in de grupo cria N ocupações com um `occupancyGroupId`;
- cada ocupação do grupo aponta para sua reserva correspondente;
- rollback completo por uma mesa ocupada, versão divergente ou `P2002`;
- edição/cancelamento bloqueados depois do check-in;
- cancelamento/edição de grupo preservados antes do check-in;
- liberação de grupo e individual;
- tenant diferente retorna 404/403 sem vazar existência;
- métricas de grupo não duplicam pessoas/sessões;
- limites de data de São Paulo e máximo de 366 dias;
- rotas, schemas e mapa B2 reconciliados.

Frontend:

- seleção múltipla continua funcionando;
- serviços expõem batch, check-in e metrics simultaneamente;
- ação de check-in de grupo aparece uma vez;
- reserva checked-in não oferece edição/cancelamento;
- ocupação ligada mostra “com reserva”;
- métricas exibem sessões agrupadas corretamente;
- mapa mantém precedência visual de ocupação sobre reserva.

### Testes PostgreSQL locais necessários posteriormente

Uma etapa separada, explicitamente autorizada, deverá validar em PostgreSQL descartável:

- índices parciais de reserva/ocupação ativa;
- unicidade de `reservationId`;
- concorrência de check-in e walk-in;
- rollback de grupo;
- FKs e isolamento entre estabelecimentos;
- consultas de métricas com volume representativo.

Não há necessidade de Supabase ou qualquer serviço remoto para esses testes.

## 11. Allowlist proposta para execução

### Backend funcional

```text
backend/src/controllers/tableReservationController.js
backend/src/controllers/tableOccupancyController.js
backend/src/repositories/tableReservationRepository.js
backend/src/repositories/tableOccupancyRepository.js
backend/src/services/tableReservationService.js
backend/src/services/tableOccupancyService.js
backend/src/routes/tableReservationRoutes.js
backend/src/routes/tableOccupancyRoutes.js
backend/src/validations/tableReservationValidation.js
backend/src/validations/tableOccupancyValidation.js
```

### Backend testes

```text
backend/test/tableReservationService.test.js
backend/test/tableOccupancyService.test.js
backend/test/tableReservationValidation.test.js
backend/test/legacyAuthorizationParity.test.js
```

### Frontend

```text
src/pages/TableReservations.js
src/pages/TableReservations.test.js
src/services/tableReservationService.js
src/services/tableOccupancyService.js
```

Total: **18 arquivos**. Qualquer necessidade fora dessa lista deve interromper a execução e voltar para autorização.

## 12. Ordem proposta de execução

1. Revalidar worktree, schema, migrations e staging.
2. Reconciliar validações e repositories.
3. Implementar regras combinadas nos services.
4. Reconciliar controllers e rotas.
5. Atualizar e executar testes backend unitários explícitos.
6. Atualizar os dois clientes HTTP frontend.
7. Reconciliar a página sobre a versão da base.
8. Atualizar e executar o teste frontend isolado.
9. Reexecutar regressões B2.18.3 e B2.18.4A.
10. Confirmar schema/migrations inalterados, staging vazio e origem preservada.
11. Produzir relatório de execução antes de qualquer teste PostgreSQL.

## 13. GO/NO-GO

### GO condicionado para execução

- aprovar a allowlist de 18 arquivos;
- aprovar check-in atômico do grupo inteiro;
- aprovar métricas group-aware;
- manter schema e migrations imutáveis;
- executar somente testes unitários/jsdom explicitamente inspecionados;
- manter PROFILED desativado e banco remoto bloqueado.

### NO-GO atual

- editar qualquer arquivo funcional antes da autorização de execução;
- substituir `TableReservations.js` ou services por uma das versões integralmente;
- remover endpoints batch, group IDs ou testes publicados;
- tratar check-in agrupado como operação de uma única mesa;
- somar `partySize` repetido como pessoas distintas nas métricas;
- migration, seed, replay, PostgreSQL, Supabase, Render ou Stripe;
- staging, commit, push, merge, rebase ou deploy;
- ativação PROFILED ou Fase C.

Planejamento encerrado. Aguardando autorização explícita para executar a reconciliação B2.18.4B com a allowlist proposta.
