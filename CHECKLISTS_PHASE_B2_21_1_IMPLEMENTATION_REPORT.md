# BASTIDOR OS — B2.21.1: Fundação do MVP de Checklists

> Data: 17 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> HEAD/base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **capacidade de distribuição, catálogo versionado, migration 61 e contratos de pontuação implementados e validados localmente; APIs e interface permanecem fora desta entrega**

## 1. Resultado executivo

A B2.21.1 implementou exclusivamente a fundação autorizada do módulo operacional de checklists:

- nova capacidade `checklists.runs.manage`, indelegável e de escopo de estabelecimento;
- concessão PROFILED somente a `ADMINISTRATOR` e `MANAGER`;
- exclusão explícita de `OWNER`, `SUPERVISOR`, `COLLABORATOR` e `AUDITOR`;
- contrato LEGACY imutável para `ADMIN` e `MANAGER`;
- catálogo organizacional de templates, versões, seções e itens;
- publicação e histórico protegidos por constraints e triggers PostgreSQL;
- validadores dos quatro tipos de resposta do MVP;
- cálculo puro e determinístico de pontuação, itens críticos e `N/A`;
- uma única migration aditiva, aplicada somente em PostgreSQL local descartável.

Resultados finais:

```text
contratos de permissão:       9/9
validadores e pontuação:      5/5
PostgreSQL real:              6/6
regressão backend completa: 287/287
Prisma schema:              válido
upgrade 60 -> 61:           aprovado
replay vazio 1 -> 61:       aprovado
```

Nenhuma API, página React, execução, atribuição, evidência, aprovação ou relatório foi implementado. PROFILED não foi ativado globalmente.

Decisão: **GO técnico para submeter a B2.21.2 à aprovação. NO-GO para iniciá-la automaticamente, publicar ou aplicar a migration fora do laboratório local.**

## 2. Preflight e isolamento

Antes das alterações foram confirmados:

| Gate | Resultado |
|---|---|
| Worktree | isolado e correto |
| Branch/HEAD | `integration/bastidor-permissions-b2` / `251d45bee...` |
| Staging | vazio |
| Migrations anteriores | 60 diretórios; nenhuma migration concorrente |
| Prisma Migrate | Prisma 5.22 e engine local disponíveis |
| Banco remoto | não utilizado |
| Worktree original | não modificado |

Como a sequência real terminava em 60 e a cerimônia do primeiro OWNER continua sem migration autorizada, a migration do catálogo tornou-se a migration 61 real do repositório. Uma futura migration do primeiro OWNER deverá usar a próxima sequência disponível; nenhuma numeração foi reservada artificialmente.

O worktree já continha alterações acumuladas e arquivos não rastreados das fases B2 anteriores. Eles foram preservados. Não houve conflito material com a fundação de checklists.

## 3. Capacidade e matriz de autorização

Foi adicionada ao catálogo V1:

```text
code:       checklists.runs.manage
module:     future_checklists
action:     manage
scope:      establishment
delegable:  false
```

Matriz final do contrato:

| Perfil PROFILED | Capacidade base | `ALLOW` pode conceder | `DENY` pode remover |
|---|---:|---:|---:|
| OWNER | não | não | não aplicável |
| ADMINISTRATOR | sim | não aplicável | sim |
| MANAGER | sim | não aplicável | sim |
| SUPERVISOR | não | não | não aplicável |
| COLLABORATOR | não | não | não aplicável |
| AUDITOR | não | não | não aplicável |

O algoritmo central do resolvedor não foi alterado. O comportamento existente — `DENY` prevalece e `ALLOW` ignora capacidade indelegável — foi reutilizado e coberto por testes.

Para futuras rotas da B2.21.2, o fallback LEGACY foi formalizado como constante:

```text
checklists.runs.manage -> ADMIN, MANAGER
```

Nenhuma rota foi adicionada nesta etapa, portanto o contrato ainda não produz autorização HTTP nova.

## 4. Modelos e relacionamentos

### `ChecklistTemplate`

Identidade estável, pertencente a uma organização. Possui código único por organização, nome, categoria, descrição, estado e membership criador.

### `ChecklistTemplateVersion`

Versão numerada de um template, com estados `DRAFT`, `PUBLISHED` e `RETIRED`. Congela exigência de aprovação, limiar, versão do algoritmo de pontuação, origem de clonagem, criador e publicador.

### `ChecklistTemplateSection`

Seção ordenada de uma versão. `stableKey` e posição são únicos dentro da versão.

### `ChecklistTemplateItem`

Item ordenado e vinculado simultaneamente à seção e à mesma versão por FK composta. Contém:

```text
responseType: BOOLEAN | CHOICE | NUMBER | TEXT
required
allowNotApplicable
critical
evidenceRequired
maxPoints
answerConfigJson
scoringConfigJson
```

Relações históricas usam `ON DELETE RESTRICT`. Nenhum `CASCADE` remove versões, seções ou itens referenciados.

## 5. Regras PostgreSQL implementadas

A migration cria quatro tabelas, três enums, índices, FKs, checks e triggers.

Garantias exercitadas:

- código e chaves estáveis não vazios e normalizados;
- posições e pontos estritamente positivos;
- limiar entre 0 e 100;
- uma única versão DRAFT por template;
- item não pode usar seção de outra versão;
- criador e publicador devem pertencer à organização do template;
- versão de origem deve pertencer ao mesmo template;
- publicação exige ao menos uma seção e um item por seção;
- somente DRAFT pode ter conteúdo alterado;
- versão PUBLISHED só pode transicionar para RETIRED;
- PUBLISHED e RETIRED não podem ser reescritas nem apagadas;
- organização sem correspondência válida falha fechada.

Foram instalados 12 vínculos de trigger, correspondentes às combinações de eventos protegidas nas quatro tabelas.

## 6. Validação e pontuação

Os contratos Zod validam estrutura completa antes da futura publicação:

- `BOOLEAN`: resposta esperada explícita;
- `CHOICE`: opções únicas e mapa de pontos limitado ao máximo do item;
- `NUMBER`: limites e operadores `GTE`, `LTE` e `BETWEEN` coerentes;
- `TEXT`: limites de tamanho e regra de completude;
- chaves e posições únicas em seções e itens;
- presença de ao menos uma seção e um item;
- versão, limiar e algoritmo válidos.

O serviço puro de scoring:

- nunca aceita pontos calculados pelo cliente;
- exclui `N/A` permitido do denominador;
- rejeita `N/A` não permitido;
- rejeita resposta obrigatória ausente;
- calcula pontos por tipo de resposta;
- marca falha crítica independentemente do percentual;
- calcula conformidade usando limiar e ausência de falha crítica.

Esse serviço ainda não persiste tentativas ou respostas; ele é uma fundação para as entregas posteriores.

## 7. Migration e bancos locais

Migration criada:

```text
20261117200927_add_checklist_template_catalog
```

SHA-256 do SQL:

```text
3af21f2778ab97640e9367c4b26382121560b4a11a0afee25d2e3d163ef4e096
```

Laboratório:

```text
PostgreSQL: 16.14
host:       127.0.0.1
port:       55442
upgrade:    bastidor_b2211_catalog
replay:     bastidor_b2211_shadow
```

Evidências:

| Caminho | Resultado |
|---|---|
| 60 migrations + deploy da 61 | schema atualizado; `migrate status` limpo |
| banco vazio + replay 1–61 | 61/61 aplicadas; `migrate status` limpo |
| schema Prisma | `prisma validate` aprovado |
| dados no banco de replay | 0 templates, 0 versões, 0 seções, 0 itens |

O banco de upgrade recebeu somente fixtures sintéticas geradas pelos testes PostgreSQL e pode ser descartado. Não houve seed, backfill ou conexão externa.

O diff inicialmente gerado pelo Prisma também detectou divergências decimais e de billing preexistentes no schema acumulado. Essas alterações não pertenciam à allowlist e foram removidas do SQL antes do deploy. A migration final contém somente o catálogo de checklists e suas relações necessárias.

## 8. Testes

### Permissões — 9/9

- catálogo único e capacidade indelegável;
- `scope = establishment`;
- matriz exata dos seis perfis;
- OWNER explicitamente excluído;
- `ALLOW` recusado para perfis sem a capacidade;
- `DENY` removendo de ADMINISTRATOR e MANAGER;
- fallback LEGACY somente `ADMIN`/`MANAGER`;
- feature flag e kill switch existentes preservados;
- autoridade OWNER organizacional sem bypass.

### Contratos e pontuação — 5/5

- quatro tipos de resposta válidos;
- estrutura e regras malformadas rejeitadas;
- `N/A` removido do denominador;
- falha crítica vencendo percentual suficiente;
- obrigatoriedade e `N/A` proibido falhando fechados.

### PostgreSQL real — 6/6

- criador/publicador cross-tenant rejeitados;
- um DRAFT, pontos e posições protegidos;
- versão publicada e conteúdo imutáveis;
- seção cross-version rejeitada;
- publicação incompleta rejeitada;
- clonagem com origem de outro template rejeitada.

### Regressão backend — 287/287

```text
tests:      287
pass:       287
fail:         0
skipped:      0
cancelled:    0
```

A primeira tentativa de regressão resolveu acidentalmente Zod 4.6.7 do worktree original e expôs uma incompatibilidade num teste legado que usa UUID sintético. A execução final usou Zod 3.25.76 da instalação limpa correspondente ao lockfile deste worktree e passou 287/287. Nenhum teste ou validador de produtos foi alterado para contornar a diferença.

## 9. Arquivos da B2.21.1

### Modificados

```text
backend/prisma/schema.prisma
backend/src/constants/permissions.js
backend/src/constants/accessProfiles.js
backend/test/permissionContracts.test.js
backend/test/permissionResolver.test.js
```

### Criados

```text
backend/prisma/migrations/20261117200927_add_checklist_template_catalog/migration.sql
backend/src/constants/checklistTemplates.js
backend/src/validations/checklistTemplateValidation.js
backend/src/services/checklistScoringService.js
backend/test/checklistTemplateContracts.test.js
backend/test/checklistTemplatePostgres.test.js
CHECKLISTS_PHASE_B2_21_1_IMPLEMENTATION_REPORT.md
```

Diff lógico resumido:

```text
permissões: 1 capacidade + composição explícita dos perfis + contrato LEGACY
schema:     3 enums + 4 modelos + relações reversas
migration:  4 tabelas + índices/FKs/checks/triggers
domínio:     constantes, validação de publicação e scoring puro
testes:      contratos de permissão, domínio e PostgreSQL real
```

O `schema.prisma` já possuía mudanças B2 anteriores contra o HEAD; por isso o diff bruto do Git não representa isoladamente esta fase. O relatório descreve o recorte lógico implementado e os arquivos anteriores foram preservados.

## 10. Estado final do Git e ambiente

| Verificação | Resultado |
|---|---|
| Branch isolada | confirmada |
| HEAD | inalterado em `251d45bee...` |
| Staging | vazio |
| Commit/push/merge/deploy | não executados |
| Migrations históricas | não modificadas |
| Total de migrations | 61 |
| PostgreSQL B2.21.1 | encerrado após os testes; diretório temporário preservado |
| Migration do primeiro OWNER | não criada |
| PROFILED global | não ativado |
| Worktree original | `feat/user-permissions-migration-plan` / `288de0c862...`; staging vazio e sem alteração por esta etapa |
| Serviços remotos | não acessados |

Não foram modificados manifests, lockfiles, autenticação, frontend ou configuração de produção.

## 11. Pendências e riscos

| Severidade | Item | Tratamento recomendado |
|---|---|---|
| Alta | ainda não existem APIs nem UI | implementar apenas após aprovação da B2.21.2 |
| Alta | elegibilidade de responsável ainda não existe | permanece fora da Migration A; validar na futura criação de execução |
| Alta | divergências visuais de capability já conhecidas | endpoint/contexto capability-aware continua pendente |
| Média | divergências Prisma preexistentes fora do catálogo | tratar em fase própria; não misturar em migration de checklists |
| Média | AUDITOR ainda não possui leitura de checklists | decisão de produto separada |
| Média | storage, retenção e evidência fotográfica indefinidos | manter fora até gate específico |
| Média | teste PostgreSQL acumula fixtures no banco descartável | usar banco exclusivo e descartá-lo após a validação |

## 12. GO/NO-GO

### GO técnico, mediante nova autorização

- iniciar a B2.21.2 para APIs e interface de templates;
- reutilizar os quatro modelos e contratos validados;
- expor criação/edição somente para DRAFT;
- publicar por transação e respeitar a imutabilidade PostgreSQL;
- manter testes LEGACY/PROFILED e cross-tenant em todo endpoint.

### NO-GO atual

- iniciar B2.21.2 automaticamente;
- implementar execuções, atribuições ou reatribuições;
- implementar fotos, aprovação ou relatórios;
- ativar PROFILED globalmente;
- aplicar a migration 61 em banco compartilhado, staging ou produção;
- modificar o primeiro OWNER;
- staging, commit, push, merge ou deploy.

B2.21.1 concluída dentro da autorização. A fundação técnica está validada e pronta para revisão antes da construção visual de templates.
