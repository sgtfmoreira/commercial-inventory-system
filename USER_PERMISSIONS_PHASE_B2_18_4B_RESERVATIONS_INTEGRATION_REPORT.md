# BASTIDOR OS — B2.18.4B: Integração local de reservas e ocupações

> Data: 11 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> Base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **reconciliação local concluída; sem banco, migration, staging, commit ou operação remota**

## 1. Resultado executivo

Reservas e ocupações foram reconciliadas seletivamente sobre a implementação publicada, sem substituir os fluxos de agrupamento existentes.

O resultado preserva:

- criação batch de reservas e ocupações;
- `reservationGroupId` e `occupancyGroupId`;
- seleção múltipla, edição/cancelamento e liberação de grupos;
- layout responsivo publicado;
- contratos existentes de API;
- autorização LEGACY e capacidades B2.

Foram incorporados:

- check-in de reserva individual;
- check-in atômico de todas as reservas de um grupo;
- vínculo único entre cada reserva e sua ocupação;
- identificação do usuário que confirmou a chegada;
- métricas conscientes de agrupamentos;
- ação e indicador de check-in, origem da ocupação e painel de métricas no frontend.

Resultados finais:

- **37/37** testes backend específicos aprovados;
- **6/6** testes frontend aprovados;
- **75/75** testes cumulativos das etapas anteriores reexecutados e aprovados;
- zero falhas nas execuções finais;
- schema Prisma válido e com o hash preservado;
- 60 migrations preservadas;
- staging vazio e working tree original intacto.

Decisão: **GO condicionado para planejar a B2.18.5 após revisão; NO-GO para banco, replay, staging, commit, deploy ou ativação PROFILED.**

## 2. Gates e isolamento

| Gate | Resultado |
|---|---|
| Worktree/branch/HEAD | Confirmados no ambiente isolado autorizado |
| HEAD | `251d45bee486fc1af41e6ba2cff5ccc896dafc56` |
| Schema SHA-256 | `47b44778697099f55625d02c9b98dfb3f0d3bf93ebf716787425d5ae705ce8af` |
| `prisma validate` | Aprovado com datasource apontado para loopback inválido |
| Migrations | 60, sem nomes duplicados |
| Staging | Vazio |
| Modo | LEGACY; PROFILED desativado nos testes |
| Serviços externos | Nenhuma conexão com Supabase, Render ou Stripe |
| Working tree original | Branch, HEAD, 243 entradas preexistentes e índice preservados |

Identidade final da origem:

```text
branch: feat/user-permissions-migration-plan
HEAD:   288de0c86262bb4a1602a418bf5b36060cbe3ddf
staged: 0
```

## 3. Arquivos efetivamente reconciliados

### Backend funcional

1. `backend/src/controllers/tableReservationController.js`
2. `backend/src/controllers/tableOccupancyController.js`
3. `backend/src/repositories/tableReservationRepository.js`
4. `backend/src/repositories/tableOccupancyRepository.js`
5. `backend/src/services/tableReservationService.js`
6. `backend/src/services/tableOccupancyService.js`
7. `backend/src/routes/tableReservationRoutes.js`
8. `backend/src/routes/tableOccupancyRoutes.js`
9. `backend/src/validations/tableReservationValidation.js`
10. `backend/src/validations/tableOccupancyValidation.js`

### Testes backend

11. `backend/test/tableReservationService.test.js`
12. `backend/test/tableOccupancyService.test.js`
13. `backend/test/tableReservationValidation.test.js`
14. `backend/test/legacyAuthorizationParity.test.js`

### Frontend

15. `src/pages/TableReservations.js`
16. `src/pages/TableReservations.test.js`
17. `src/services/tableReservationService.js`
18. `src/services/tableOccupancyService.js`

Dezessete arquivos aparecem como diferenças rastreadas contra o HEAD. `legacyAuthorizationParity.test.js` já era não rastreado no conjunto cumulativo B2 e foi alterado exclusivamente dentro da allowlist. Nenhum arquivo funcional fora da lista foi modificado nesta etapa.

## 4. Check-in transacional

O fluxo final executa em uma única transação Prisma:

1. busca a reserva por `id + establishmentId`;
2. valida status, versão, check-in e ocupação existentes;
3. carrega todos os membros históricos do `reservationGroupId` no mesmo estabelecimento;
4. falha fechado se algum membro estiver cancelado, divergente, já conferido ou vinculado;
5. compara a data da reserva com a data local de São Paulo;
6. verifica todas as mesas contra ocupações ativas do estabelecimento;
7. atualiza todas as reservas por versão e `checkedInAt IS NULL`;
8. cria uma ocupação por reserva;
9. usa um único `occupancyGroupId` quando há mais de uma mesa;
10. vincula cada ocupação à reserva correspondente por `reservationId`;
11. retorna os contratos unitários anteriores e também os arrays do grupo.

Conflitos `P2002`, alteração concorrente, ocupação prévia ou inconsistência de qualquer membro produzem conflito HTTP lógico 409. Em PostgreSQL real, a exceção dentro de `$transaction` reverte atualização e criações do grupo.

Edição e cancelamento também carregam o grupo histórico e exigem que todos os membros permaneçam confirmados, na mesma versão e sem check-in.

## 5. Métricas group-aware

O repository limita a consulta por `establishmentId` e faixa `seatedAt` calculada com fronteiras de São Paulo.

O resumo agrega por:

```text
occupancyGroupId || occupancy.id
```

Assim:

- um atendimento agrupado conta como uma sessão;
- `partySize` é contado uma vez no total global;
- origem reserva/walk-in é classificada uma vez;
- permanência do grupo entra uma vez e somente quando todas as linhas foram liberadas;
- sessões abertas não entram na média de permanência;
- cada mesa continua contando separadamente para giro e métricas por mesa.

O período é validado como data real, ordenado e limitado a 366 dias.

## 6. Contratos de API preservados

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

As rotas continuam protegidas por autenticação, papéis `ADMIN|MANAGER` e estabelecimento `COMMERCIAL`. Rotas estáticas permanecem antes dos parâmetros relevantes. O inventário observado passou de 193/183 para **195 rotas legadas / 185 rotas internas**, exatamente pelas duas novas rotas reconciliadas.

## 7. Evidências multi-tenant e de segurança

- buscas e mutações por ID incluem `establishmentId`;
- buscas por grupo incluem group ID e `establishmentId`;
- métricas incluem tenant e período;
- IDs de usuário são derivados de `req.user.userId`;
- o cliente não fornece `establishmentId`, `checkedInByUserId` ou `reservationId` para walk-in;
- apenas o fluxo interno de check-in cria o vínculo reserva–ocupação;
- repositories de walk-in ignoram reservas já conferidas, mas continuam bloqueando reservas confirmadas pendentes;
- LEGACY continua permitindo apenas `ADMIN|MANAGER` nessas famílias de rotas;
- o resolvedor B2 cobriu as 185 rotas internas com decisão equivalente.

## 8. Frontend preservado e ampliado

A página do worktree isolado permaneceu como base. Foram preservados mapa responsivo, zoom, seleção múltipla, batch, grupos, importação e modais existentes.

Foram adicionados:

- uma única linha e uma única ação de check-in por `reservationGroupId`;
- botão de chegada somente para reserva confirmada, não conferida e na data local atual;
- campos e ações de edição/cancelamento desabilitados após check-in;
- indicador de chegada e responsável;
- identificação “Com reserva” ou “Sem reserva” nas ocupações;
- painel de métricas com período, sessões, pessoas, origem e permanência;
- atualização coordenada de reservas, ocupações e métricas após check-in, criação e liberação.

Os clientes HTTP expõem simultaneamente os contratos batch, check-in e metrics.

## 9. Testes executados

Todas as execuções usaram URL PostgreSQL inválida em loopback, flags PROFILED desativadas e nenhuma credencial Stripe. Os testes foram previamente classificados como puros, mockados, injetados ou de inspeção estática.

### Específicos backend

```text
tableReservationService.test.js
tableOccupancyService.test.js
tableReservationValidation.test.js
legacyAuthorizationParity.test.js
```

Resultado: **37 aprovados, zero falhas**.

Cobertura adicional inclui batch, check-in individual, check-in de grupo, membro histórico inconsistente, mesa ocupada, `P2002`, bloqueio pós-check-in, liberação de grupo, métricas sem duplicação, fuso de São Paulo, escopo tenant e paridade das rotas.

### Frontend isolado

Resultado: **6 aprovados, zero falhas**.

Foram exercitados mapa de 27 mesas, datas locais, multisseleção, importação, clientes batch/check-in/metrics e deduplicação de grupo com uma única ação elegível.

O Jest foi executado com configuração equivalente fornecida em memória, porque o worktree isolado não possui `node_modules`; as dependências locais já instaladas no workspace original foram reutilizadas sem instalação ou alteração de arquivos.

### Regressão cumulativa B2.18.3/B2.18.4A

Resultado: **75 aprovados, zero falhas**.

Inclui autorização/billing, inventário de rotas, estoque, transferências, validações, reparação pura e demais testes previamente aprovados. Somando as três execuções finais houve 118 aprovações; oito casos de paridade fazem parte tanto da suíte específica quanto da regressão cumulativa.

Tentativas iniciais de iniciar os runners sem o caminho local de dependências não chegaram a executar casos de teste e não são contabilizadas como reprovação funcional.

## 10. Verificações estáticas

| Verificação | Resultado |
|---|---|
| `node --check` nos 14 arquivos backend/testes | Aprovado |
| Transformação JSX/Jest da página reconciliada | Aprovada |
| `git diff --check` | Aprovado |
| `prisma validate` | Aprovado, sem conexão |
| Schema SHA-256 | Preservado |
| Migrations | 60 |
| Nomes duplicados | Zero |
| Staging | Vazio |
| Migration/seed/replay | Não executados |
| Serviços externos | Não acessados |

## 11. Hashes finais da allowlist

| Arquivo | SHA-256 |
|---|---|
| `tableReservationController.js` | `5018e0cab73c57ece58c1d4836c0c72f926e9bfdb98f5961038780f7210e2fc9` |
| `tableOccupancyController.js` | `acb0727cc412d34f5d468c588a130485fe5a726317af024e5888dcc41ab3d9cd` |
| `tableReservationRepository.js` | `c67af1f76e018292f1e3b20805712c55d22a2b9856042a74013d100e0308dff4` |
| `tableOccupancyRepository.js` | `fe5c1afbcbedd01fa3a5d9195e0f688751d9ba51cd3d55d1805faff150ec8abe` |
| `tableReservationService.js` (backend) | `88a72c4d1d98ddd5f2732eed099ea6f61a92a8cbc3f364d9389df3b100fcad00` |
| `tableOccupancyService.js` (backend) | `943f2fdb8ea19ca4c984e13adf0462540042047214019a3b6a6b559ae4e7fe6c` |
| `tableReservationRoutes.js` | `ea30c6eaf9ae52e11630fe45e56e8cc4cfb240607fd5fea72a639854687f1d32` |
| `tableOccupancyRoutes.js` | `81de58c047510a024c6bef5d1bba87a342a8a596f656bd9d020928a9f1b80ddf` |
| `tableReservationValidation.js` | `9457ae8214ad0a6a2986540f300303ea4f0f0934cfb5e2893fd689f6c4cdb35c` |
| `tableOccupancyValidation.js` | `2417cd26158225364976ac63bb6a90f2b10e1adaf243721303a38101baad2002` |
| `tableReservationService.test.js` | `2e654d70296d1325715f6b709db6eb58dd0c30a96de48c5b6096f8b1f8fd3e2c` |
| `tableOccupancyService.test.js` | `03809015b87058c58080f469835c7aa4692bd46e70ac65d80c54aabab21100eb` |
| `tableReservationValidation.test.js` | `4db39d2eeb9662625308a849b64423d802ccf9f0e48053215bd8a2b7719a556f` |
| `legacyAuthorizationParity.test.js` | `c61887746f56f378ee29791f26cc0ca4d26001ef9a6b25aaf7296faadb0c5619` |
| `TableReservations.js` | `68a2d9fe8b22a1cc51809fca7e07da14fe8dbacc6f817a219f592a01a00e913b` |
| `TableReservations.test.js` | `a6c89a1120824222fa258ad9ec05f037d32cf744ca99c5caa2ddd02eb1c0487f` |
| `tableReservationService.js` (frontend) | `238cd8a13447ee5cfe8208b3f63144bd64e7d6088a1d07daf3f43992e9d81746` |
| `tableOccupancyService.js` (frontend) | `10d1d290d9f074bd4ac5345ace6d34189467af5452c33c082ed89a5cb4e42dc2` |

## 12. Pendências e riscos

| Criticidade | Item | Gate |
|---|---|---|
| Crítica | Credencial PostgreSQL anteriormente exposta | Rotacionar antes de qualquer operação remota |
| Alta | B2.14 read-only ainda pendente | Confirmar história e checksums do Supabase |
| Alta | 60 migrations ainda sem replay reconciliado | Validar em PostgreSQL local descartável em etapa própria |
| Alta | Concorrência e constraints foram provadas apenas por unidade/mocks | Executar teste PostgreSQL local autorizado para índices parciais, FK, `reservationId @unique` e rollback real |
| Alta | Frontend não teve teste de interação renderizada completo | Acrescentar teste de componente/E2E local antes de release |
| Média | Métricas por mesa repetem `partySize` do grupo em cada mesa | Correto para visão por mesa; não somar essa coluna como total global |
| Média | Consultas de métricas podem exigir ensaio com volume | Medir somente em PostgreSQL local/ambiente autorizado |
| Média | B2/PROFILED permanece opt-in | Não ativar antes dos gates e da autorização de fase |

## 13. Restrições respeitadas

- nenhum arquivo funcional fora da allowlist foi alterado;
- nenhum schema, migration, package ou lockfile foi modificado;
- nenhuma migration, seed, replay, SQL ou reparação foi executada;
- nenhuma conexão com Supabase, Render ou Stripe;
- nenhum `git add`, commit, push, merge, rebase ou cherry-pick;
- nenhuma alteração no working tree original;
- nenhuma ativação PROFILED;
- nenhum deploy ou início da Fase C.

## 14. GO/NO-GO

### GO condicionado

- aceitar a reconciliação local de reservas e ocupações para revisão;
- aceitar os contratos batch, grupos, check-in e métricas combinados;
- aceitar as evidências unitárias e estáticas desta etapa;
- preparar a B2.18.5 somente após nova autorização e allowlist explícita.

### NO-GO

- iniciar automaticamente a B2.18.5;
- staging, commit, push ou deploy;
- ativar PROFILED;
- usar banco real ou remoto;
- executar migration, seed, replay ou script operacional;
- considerar os testes unitários substitutos do ensaio PostgreSQL local de concorrência.

Execução encerrada no limite autorizado da B2.18.4B. Aguardando revisão.
