# BASTIDOR OS — B2.18.1: Integração local das migrations e reconciliação do schema

> Data: 10 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> Base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **integração local concluída; sem staging, commit, banco ou operação remota de aplicação**

## 1. Resultado executivo

As nove migrations autorizadas foram incorporadas ao worktree isolado com conteúdo byte a byte idêntico às fontes. As 51 migrations da base permaneceram inalteradas. O conjunto final contém exatamente 60 migrations, sem nomes duplicados.

O `schema.prisma` remoto foi mantido como base e reconciliado campo a campo para incorporar billing, ciclo de estabelecimentos, check-in, métrica de ocupação e autorização B2. Foram preservados os agrupamentos remotos, eventos, estoque, porcionamento, lotes, conversão de transferências e isolamento multi-tenant.

`prisma validate` foi aprovado com `DATABASE_URL` forçada para loopback inválido. Nenhuma migration foi aplicada e nenhuma conexão remota foi aberta.

Decisão: **GO condicionado para iniciar uma futura integração do código B2 no worktree isolado; NO-GO para staging, commit, deploy ou banco.**

## 2. Gates iniciais

| Gate | Resultado |
|---|---|
| Caminho, branch e HEAD | Confirmados no worktree autorizado |
| Status inicial | Limpo |
| `origin/main` via `git ls-remote` | `251d45bee486fc1af41e6ba2cff5ccc896dafc56` |
| Render Live `a459869` ancestral da base | Sim, pai direto |
| Arquivos-fonte | 9/9 presentes |
| Colisões no destino | Zero |
| Working tree original | Preservado, sem staging |
| Contagem inicial | 51 migrations |

A única consulta remota foi `git ls-remote`. Não houve acesso ao Render ou Supabase.

## 3. Arquivos adicionados

### Sete recuperações B2.15

1. `20260921170000_restore_stock_location_schema`
2. `20261011212000_restore_portioning_schema`
3. `20261026185000_restore_stock_transfer_destination_product`
4. `20261030170000_add_organization_billing_and_establishment_lifecycle`
5. `20261107120000_add_user_access_control`
6. `20261107130000_restore_recipe_yield_and_index_names`
7. `20261107131000_restore_commercial_supporting_indexes`

### Duas funcionalidades preservadas da feature

8. `20261021150000_add_table_occupancy_metrics_index`
9. `20261023120000_link_reservation_check_in`

As migrations remotas `20261020220000_group_table_reservation_guests` e `20261030193000_group_table_occupancies` permaneceram intactas.

## 4. Hashes das nove migrations adicionadas

| Migration | SHA-256 origem/destino |
|---|---|
| `20260921170000_restore_stock_location_schema` | `4705da8807635f41b0fa317a6dda331bf25c39946b0cb16709c0988c4030370b` |
| `20261011212000_restore_portioning_schema` | `4771381a0b35ac67934c8b5dd496ceeb8048ce5cd4ab9296fb3f8e7229874370` |
| `20261026185000_restore_stock_transfer_destination_product` | `d454926bf75b304b5a716876f23a7f4163df195b0cf7f517fc1e741cc9111600` |
| `20261030170000_add_organization_billing_and_establishment_lifecycle` | `aa8620d903c55b4aa7761fa37294e1945ba87af6733d3fa8a9c0241e265a29c8` |
| `20261107120000_add_user_access_control` | `958ecb58d3e31068a5340a7e5ac190418a58ce3ea4ce9779edf9591cd0215c84` |
| `20261107130000_restore_recipe_yield_and_index_names` | `06b131261ad1aeebeae3ed116f5b4f07d26f1944504a20cea1c6f0acbf4ed56e` |
| `20261107131000_restore_commercial_supporting_indexes` | `8ae5748b67924fa16c706d8b02dd0c16dd725a15959b1f359b5f7beb24ba49d7` |
| `20261021150000_add_table_occupancy_metrics_index` | `aacef10b1e27452f815f9f08614cf41b2edd5956ddb6daeb3e9771f6ef3635d6` |
| `20261023120000_link_reservation_check_in` | `e8c8fdaeab66e10cad51d696348ba6b580a8269b38c4cf574cdae01140b76eb7` |

Todos os pares origem/destino foram comparados sobre bytes reais e coincidiram.

## 5. Integridade da base

As 51 migrations rastreadas foram comparadas byte a byte com outro worktree limpo no mesmo SHA:

```text
migrations comparadas: 51
divergências de bytes: 0
diff de migrations rastreadas contra HEAD: vazio
```

Nenhuma migration histórica foi editada, renomeada ou removida.

## 6. Manifesto das 60 migrations

| Migration | SHA-256 no worktree |
|---|---|
| `20260304193850_init` | `24afeb324c4ecd6801f87c6c3fae9a0caa93ec98c6cbc9511dbf7b1d5b6b80f5` |
| `20260304205357_add_created_at_to_purchase_order_items` | `a5948fafb43b1e9f78e89a87b38da5199386137d9bd5a303d359b6570c538733` |
| `20260305014321_product_suppliers` | `f50a6edf641db102264aa8104c46b1488aa654f95ed36c6f3383ee7c9c4b4384` |
| `20260305033053_remove_product_supplier_relation` | `a208b9bdfff20c17950f585e612e4d3a2b08502ea2e350bd39404e0ce0584a59` |
| `20260307025448_add_price_to_product_supplier` | `ea9df6391a4a908f9a7981a7cf324ef705dda7d0fd4e956fdfae39ea3cdfaf1e` |
| `20260310153549_add_product_unit_conversion` | `fdb2af7e9d2118f12d28b14693d94fe6816232407c6ce5d170c4c4bfe6926948` |
| `20260310161243_multi_user_establishment` | `4187b66d87887a2368e765de16472474d2c63c4a62608ed3eafadaf1d65c2fdf` |
| `20260310215121_product_decimal_stock` | `64a119286003a62ed1ab86f669c778554fae04f1e4709a50a968d39dd4fd2196` |
| `20260313144503_add_organization` | `731d4f51b4ae51e84b87db44c3bd06d925ea1a3a0a50b7ad0756851a01066ba2` |
| `20260313154450_stock_transfer` | `2ae2be26fedf4840f8edceee78c040d5f84716ad7ea0c663976b49a71738f139` |
| `20260313175840_user_establishment_relation` | `9143972fe6862b4038b45416d3ffa9304acb1e5af2b34e9f3ddd986546f5f842` |
| `20260314024626_add_transfer_status` | `5cff63caa610a4eebbc43844683165372390ab65569213408b68c8ecfd14edeb` |
| `20260316142059_add_user_roles` | `79133822f1117284e000816ef2ed151b9672e36ed68b906f4df309e2584af6b6` |
| `20260316144222_create_stock_audit` | `a4f4464c8c905388474e664f1d0d8baf8f450eb25956e03957614ac86692f505` |
| `20260316184115_atualizacao_de_banco_de_setores` | `adcbd014aa3caa63eb50dab6aec9ad0667de56b68779b608686f4d7a813d50f9` |
| `20260316184954_default_values_stock_audit_items` | `c304b6a8b2d28bca9f6d3e535e63148a1c06ae973d17c0704e1c49a3c95b57da` |
| `20260317015816_add_product_current_cost` | `ead0dca6b65749e3b60307d76e921b08d5cc070a7e6f0b92d3082e5dcac0f151` |
| `20260318143702_remove_stock_sector` | `eab07630b98f812faff41caa1271d024502c06b4470a93fc4c83fc4be0c3ecf3` |
| `20260320033558_add_reason_stock_movement` | `c2b78a3da413cf0ffcfe5fee0d86cf8c48f40cdd008c9ee2281a7c48b3114349` |
| `20260327133057_add_cost_to_stock_movement` | `1e365f99aa900be5d846d5ce6aa84ad20bb1870902167c9a07fecb8d98bd9df6` |
| `20260331185815_add_establishment_to_purchase_order` | `b7ee5cc1f4cc3eaea47c98f0e31bba486b72046de3601fe368d2680ac6858d92` |
| `20260331192744_add_unique_category_name` | `8bbcc05138905b93cb95db157a158f36cfc33dbb62f6cb3cb9a1df1ae5a4e972` |
| `20260406134938_add_purchase_conversion_units` | `9b18fc0987604f31896dea977ade70f96eeacd20ca112d83617d58b12bde94cb` |
| `20260406203929_add_consumption_events` | `c0d33ec011449273e5c30a6e33b41872ee649d7f9dca6260c6da56f74826dbf6` |
| `20260407001607_add_establishment_id_to_category` | `8045d57d9e3a34844856bdf0a7cf5669a436e9cfc51f2f69d895accf40210404` |
| `20260410145732_structural_refactor_multitenancy` | `e8b3f8f2251212cd402d49af5fb762300ec75f3c9938d244f74f01d4dba69396` |
| `20260417220612_add_performance_indexes` | `9aba2a353e3432ae7c896cc882f4e7f609dabea0b3cd4703eb8b6f9ef8031748` |
| `20260429224355_add_transfer_costs` | `e24d725876815d3acdd289d0fa029f61b162b16184919f93932f788075d9c19f` |
| `20260609133700_add_production_orders` | `e0241cf5f620bdb6e2352973931a06e39380b2c636fa96820e33572b34f04aef` |
| `20260609142600_add_asset_enum` | `bc834530ca6a64e2997997080e9b63d1fc379306b18fcbc185a827e825b3a4fe` |
| `20260824223000_add_purchase_classification` | `0a63aefefc2385f07caa89973b78f74da4f3e7ad12cf452d03f2318cceea70dc` |
| `20260825010000_add_sales_financial_data` | `19534160ddf473bb1885f6017d17fadb6692f72407e82d8dd6fec8b0e11f7e3f` |
| `20260825030000_add_commercial_bonus_agreements` | `0c1748fad88436fed134077efd54bbdaf167096fa274e19270c3ef1bcfc12069` |
| `20260826120000_add_organization_products` | `3987ae6c05632fbb213105809016bf7928065bc24761acbf87815e9808bf583a` |
| `20260826150000_add_organization_product_reviews` | `a09b69d17c82da07c95ef5c2fe65fbcfe30d40b9fa25886785a5890b27eefe68` |
| `20260830120000_add_stock_audit_counted_at` | `388ecae0f7267c8b53f3e9d09fbe90834b9cddb701f4b5a53cf49b99dc19c5a4` |
| `20260831120000_add_organization_suppliers` | `b3e57e48c38b197ee52869d685dd869bc7ec1c2b4f18cf7ac1b6b146ba3e1e69` |
| `20260831180000_add_supplier_catalog_and_price_updates` | `da3df3fbc769fb95dd09162256b58c442233b53ec7a264ccb82a931b96f57909` |
| `20260831220000_add_supplier_portal_users` | `0543d0c9c390b08b268fce66fdfa2f6c90c4ec6b0b0ad9bb919931a6caa8911a` |
| `20260831235000_paginate_supplier_price_updates` | `cb638726a39d2d037161213d8a643d2687857763997aceedb34ff5e0b6495c89` |
| `20260831235900_paginate_stock_movements` | `493573dba3231f1cf802707c14afd47871f759dac98003fe013a23bbcbb2a3b8` |
| `20260906230000_add_product_sale_price` | `26f10d485568d6f367716557548a6baa556790b919ef64bb5e87ea76d4096e60` |
| `20260920120000_purchase_returns` | `ae9cb7315d830213cdeed3c81eee45e282a40f9f8156504b859986491ac9f369` |
| `20260921170000_restore_stock_location_schema` | `4705da8807635f41b0fa317a6dda331bf25c39946b0cb16709c0988c4030370b` |
| `20260921180000_guard_stock_location_tenant` | `f29c02ead5d7b9c261cf7258dc3d4af086b7e83f83b7698aa629072481de2db2` |
| `20261005120000_add_commercial_events_phase_01` | `d98a69bff14f78a0d865a4e64b93baf41ad7ce4797ccd5c39573f79e30b29a80` |
| `20261011212000_restore_portioning_schema` | `4771381a0b35ac67934c8b5dd496ceeb8048ce5cd4ab9296fb3f8e7229874370` |
| `20261011213000_add_inventory_lots_and_portioning_yield` | `25e4c4c03afd6a6d9699a932fb17d8b481507d17920dedd10d575a4791790143` |
| `20261019120000_add_table_reservations` | `c786886bd4f71b6f0ac917af24e7487b74273cbc27b49d062e2272afef116265` |
| `20261020193000_add_table_occupancies` | `1ac33b9e920deb9d0656ac033ac0fded043e21982fc1aa43666ef63338ad670b` |
| `20261020220000_group_table_reservation_guests` | `0f47a31d977a8fe4b14ee0245f3a721c352d190c19ca7d1c8d1debc45fc91ea7` |
| `20261021150000_add_table_occupancy_metrics_index` | `aacef10b1e27452f815f9f08614cf41b2edd5956ddb6daeb3e9771f6ef3635d6` |
| `20261023120000_link_reservation_check_in` | `e8c8fdaeab66e10cad51d696348ba6b580a8269b38c4cf574cdae01140b76eb7` |
| `20261026185000_restore_stock_transfer_destination_product` | `d454926bf75b304b5a716876f23a7f4163df195b0cf7f517fc1e741cc9111600` |
| `20261026190000_add_stock_transfer_conversion` | `a324e35260402b318ea79ded942d5e81df0e3d2e2ab393f80dcb64aa694f0a8f` |
| `20261030170000_add_organization_billing_and_establishment_lifecycle` | `aa8620d903c55b4aa7761fa37294e1945ba87af6733d3fa8a9c0241e265a29c8` |
| `20261030193000_group_table_occupancies` | `71dee1fac0a372a9f28a61794407abd264325b2f1c4bc9a058353ac68b33be50` |
| `20261107120000_add_user_access_control` | `958ecb58d3e31068a5340a7e5ac190418a58ce3ea4ce9779edf9591cd0215c84` |
| `20261107130000_restore_recipe_yield_and_index_names` | `06b131261ad1aeebeae3ed116f5b4f07d26f1944504a20cea1c6f0acbf4ed56e` |
| `20261107131000_restore_commercial_supporting_indexes` | `8ae5748b67924fa16c706d8b02dd0c16dd725a15959b1f359b5f7beb24ba49d7` |

Os hashes representam os bytes no filesystem Windows. A auditoria B2.14 continua necessária para comparar os checksums do ambiente efetivo.

## 7. Resumo do schema reconciliado

Enums incorporados: `OrganizationSubscriptionStatus`, `AuthorizationMode`, `AccessProfileCode`, `AccessConfigurationStatus`, `PermissionEffect` e `OrganizationAuthorityType`.

Modelos incorporados: `OrganizationSubscription`, `BillingWebhookEvent`, `UserEstablishmentAccess`, `AccessConfiguration`, `PermissionOverride`, `OrganizationAuthority` e `SecurityAuditEvent`.

Também foram incorporados:

- `isActive`, arquivamento e motivo em `establishments`;
- `checkedInAt`, `checkedInByUserId`, relação de check-in e índice em `TableReservation`;
- `reservationId` único e índice de métrica em `TableOccupancy`;
- relações reversas B2/billing em `Organization`, `users`, `establishments` e `UserEstablishment`.

Foram preservados `reservationGroupId`, `occupancyGroupId`, eventos, `yieldQuantity`, `destinationProductId`, porcionamento e lotes.

```text
declarações base:       68
declarações feature:    81
união esperada:         81
schema reconciliado:    81
ausentes da união:       0
extras fora da união:    0
```

## 8. Validação estática

Foi executado somente `prisma validate`, com a URL do processo apontando para `127.0.0.1:1`. Resultado: schema válido.

Verificações adicionais:

- 60 diretórios válidos com `migration.sql`;
- zero nomes duplicados;
- ordem lexical coerente;
- `git diff --check` sem erro;
- zero alteração nas migrations rastreadas.

Hashes do schema:

| Estado | SHA-256 |
|---|---|
| Base limpa | `f33cb8748e0d191bb358bce256bbb2bd72767e9869e53c4891ad607b79b2ed8f` |
| Reconciliado | `47b44778697099f55625d02c9b98dfb3f0d3bf93ebf716787425d5ae705ce8af` |

Diff do schema: 230 inserções e 19 remoções. Nenhum modelo ou enum da união base + feature foi removido.

## 9. Divergências pendentes

- Oito precisões `numeric` continuam divergentes entre SQL e datamodel; nenhuma foi alterada.
- `organization_subscriptions.updatedAt` possui default na migration, mas somente `@updatedAt` no schema.
- Os índices únicos parciais DRAFT/ACTIVE existem no SQL B2 e não são representáveis diretamente no Prisma.
- Estratégia `CREATE INDEX` versus `CONCURRENTLY`, backfill de billing e locks continuam dependentes da auditoria.
- O replay PostgreSQL das 60 migrations ainda não foi executado nesta subetapa.

## 10. Riscos

| Criticidade | Risco | Gate |
|---|---|---|
| Crítica | Credencial PostgreSQL exposta | Rotacionar antes de operação remota |
| Alta | B2.14 ainda não executada | Auditar história real antes de versionar/aplicar |
| Alta | Render Live está um commit atrás da base | Manter produção e base Git distintas |
| Alta | Schema ainda não foi provado por replay das 60 migrations | Etapa local descartável posterior |
| Alta | Billing contém backfill/default divergente | Decisão separada |
| Média | Precisões e índices dependem de dados/locks | Manter fora do escopo |
| Média | Código ainda não foi integrado | Não usar o schema pela aplicação até validação |

## 11. Estado Git

No worktree isolado há somente o schema modificado, nove diretórios novos de migration e este relatório não rastreado. Staging e commits permanecem vazios.

No working tree original, branch, HEAD, arquivos funcionais e índice permaneceram inalterados.

## 12. GO/NO-GO

### GO condicionado

- aceitar o conjunto local de 60 migrations;
- aceitar o schema reconciliado como base da próxima revisão;
- autorizar futuramente a integração seletiva do código B2 no worktree isolado.

### NO-GO

- migration, seed, replay, Supabase ou Render;
- alteração das precisões ou do default de billing;
- `git add`, commit, push, merge, rebase ou cherry-pick;
- edição de código de aplicação ou dependências;
- deploy ou Fase C.

Execução encerrada no limite autorizado da B2.18.1. Aguardando revisão.
