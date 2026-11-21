# BASTIDOR OS — B2.18.2: Integração seletiva do código de permissões

> Data: 10 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> Base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **integração local concluída; LEGACY permanece padrão; sem staging, banco ou operação remota**

## 1. Resultado executivo

O código de autorização B2 foi integrado seletivamente no worktree isolado. Foram portados 14 arquivos exclusivos de runtime — incluindo a dependência complementar `validateParams.js` — e sete testes B2. Os quatro arquivos compartilhados autorizados foram reconciliados manualmente sobre a base remota, sem substituição integral.

O modo PROFILED não foi ativado. As flags continuam desabilitadas por padrão, a ausência de configuração ativa preserva o caminho LEGACY e o datamodel mantém `AuthorizationMode.LEGACY` como default.

A validação local terminou com:

- 29 testes aprovados e zero falhas;
- paridade de decisão nas 176 rotas internas legadas da base remota;
- 185 rotas legadas preservadas e oito rotas B2 novas inventariadas;
- 25 arquivos JavaScript aprovados em verificação de sintaxe;
- schema Prisma válido e com o mesmo hash da B2.18.1;
- 60 migrations preservadas, sem duplicatas e sem edição das 51 migrations rastreadas da base;
- zero arquivo staged, zero conexão remota e zero execução de migration/seed.

Decisão: **GO condicionado para a próxima subetapa de integração local explicitamente autorizada; NO-GO para banco, staging, commit, deploy ou Fase C.**

## 2. Gates iniciais

| Gate | Resultado |
|---|---|
| Worktree/branch | Confirmados |
| HEAD | `251d45bee486fc1af41e6ba2cff5ccc896dafc56` |
| Migrations | 60 |
| Hash do schema reconciliado | `47b44778697099f55625d02c9b98dfb3f0d3bf93ebf716787425d5ae705ce8af` |
| Estado inicial | Restrito aos artefatos B2.18.1 |
| Staging | Vazio |
| Working tree original | Branch/HEAD e 243 entradas de status preservados; staging vazio |

O working tree original permaneceu em `feat/user-permissions-migration-plan@288de0c86262bb4a1602a418bf5b36060cbe3ddf`.

## 3. Arquivos exclusivos portados

### Runtime B2

```text
backend/src/config/authorization.js
backend/src/constants/accessProfiles.js
backend/src/constants/legacyPermissionMap.js
backend/src/constants/permissions.js
backend/src/controllers/userAccessController.js
backend/src/middlewares/requireCapability.js
backend/src/middlewares/validateParams.js
backend/src/repositories/securityAuditRepository.js
backend/src/repositories/userAccessRepository.js
backend/src/routes/userAccessRoutes.js
backend/src/services/organizationAuthorityService.js
backend/src/services/permissionResolverService.js
backend/src/services/userAccessConfigurationService.js
backend/src/validations/userAccessValidation.js
```

### Testes

```text
backend/test/legacyAdminAuth.test.js
backend/test/legacyAuthorizationParity.test.js
backend/test/organizationAuthority.test.js
backend/test/permissionContracts.test.js
backend/test/permissionPersistence.test.js
backend/test/permissionResolver.test.js
backend/test/userAccessConfiguration.test.js
```

Treze arquivos de runtime, `validateParams.js` e seis dos testes permanecem byte a byte idênticos às fontes. O teste de paridade foi reconciliado deliberadamente com a base remota, conforme a seção 6.

## 4. Dependência complementar `validateParams.js`

Antes da cópia foram confirmados:

- o arquivo não possui imports nem dependências transitivas;
- executa apenas `schema.safeParse(req.params)` quando o middleware é chamado;
- não acessa banco, rede, filesystem, variáveis de ambiente, processos ou timers;
- sua importação apenas declara e exporta uma função;
- não requer pacote adicional;
- não existia implementação equivalente em `HEAD`; a base continha somente `validate.js`, voltado ao corpo da requisição;
- a única necessidade nova é o uso explícito pelas rotas B2 para validar `:userId`.

Integridade:

```text
SHA-256 origem:  2105df5538d4e5fc418eeef55429aac257a19c6e5ce0bb756a003269c9e0f65d
SHA-256 destino: 2105df5538d4e5fc418eeef55429aac257a19c6e5ce0bb756a003269c9e0f65d
```

## 5. Arquivos compartilhados reconciliados

### `backend/src/app.js`

Foram adicionados somente o import e o mount de `/api/user-access`. Rotas publicadas de eventos, reservas e demais módulos foram preservadas. Rotas de billing, organização e Stripe presentes no working tree original não foram incorporadas nesta subetapa.

### `backend/src/middlewares/authMiddleware.js`

Foram incorporados:

- contexto do vínculo ativo, estabelecimento e organização;
- fallback compatível para banco anterior às colunas de lifecycle;
- resolução da política B2 somente quando `USER_PERMISSIONS_ENABLED` estiver explicitamente ativa;
- decisão fail-closed em PROFILED;
- manutenção do token, papel legado e mensagens existentes quando B2 estiver desativada.

Com flags desabilitadas, o middleware não consulta as tabelas de configuração B2.

### `backend/src/middlewares/requireRole.js`

O middleware continua aplicando as listas históricas no modo LEGACY. Ele somente deixa de repetir a decisão quando uma autorização PROFILED já foi efetivamente resolvida e marcada como `enforced` pelo resolvedor central.

### `backend/src/services/authService.js`

Foram incorporados seletivamente:

- vínculos e estabelecimentos ativos;
- contexto organizacional;
- papel por estabelecimento nas respostas de login/contexto;
- validação de unidade ativa ao trocar de estabelecimento;
- fallback compatível com a história anterior às colunas de lifecycle.

Foram preservados os contratos e erros da base. O registro de usuário não foi alterado. Integrações de billing, criação de assinatura e outras mudanças fora da allowlist foram excluídas.

## 6. Conflitos encontrados e resolução

| Conflito | Diagnóstico | Resolução |
|---|---|---|
| `validateParams.js` ausente | Dependência local única das rotas B2 | Autorização complementar, inspeção e cópia byte a byte |
| `authService.js` da origem misturava B2 e billing | Cópia integral violaria o escopo | Merge apenas de autenticação/contexto/lifecycle; billing excluído |
| Snapshot de rotas esperava 192/182 | Esses totais incluíam sete rotas de billing/organização fora da B2.18.2 | Snapshot reconciliado para 185 rotas legadas e 176 internas da base remota; oito rotas B2 continuam separadas |
| Nome local `sourceEst` versus remoto `sourceEstablishment` | Diferença nominal na mesma regra organizacional | Regex aceita ambas as formas |
| Base remota não possui `strongestMemberships` | A implementação publicada usa `distinct: ['userId']` | Snapshot passa a verificar a implementação efetivamente preservada |
| Worktree sem `node_modules` | Instalação foi proibida | Testes usaram dependências já instaladas no diretório original via `NODE_PATH`, sem escrever ou instalar |

Nenhum conflito exigiu alteração fora da allowlist.

## 7. Rotas B2 incorporadas

Foram montadas oito APIs sob `/api/user-access`:

```text
GET  /permissions
GET  /profiles
GET  /users/:userId
GET  /users/:userId/preview
GET  /users/:userId/history
PUT  /users/:userId/draft
POST /users/:userId/activate
POST /users/:userId/rollback
```

Todas passam por autenticação. Leitura exige a capacidade `users.permissions.read`; mutações exigem `users.permissions.manage`. No modo LEGACY, ambas preservam o requisito histórico de ADMIN.

## 8. Cobertura das regras de segurança

| Regra | Evidência local |
|---|---|
| Seis perfis | OWNER, ADMINISTRATOR, MANAGER, SUPERVISOR, COLLABORATOR e AUDITOR validados |
| Catálogo granular | 113 códigos únicos de permissão |
| LEGACY como padrão | Flags false por omissão; schema com default LEGACY; testes de ausência/DRAFT |
| Ativação individual/reversível | DRAFT, confirmação, optimistic lock, ACTIVE e rollback auditado |
| Sem unidade nova automática pelo B2 | Nenhuma rotina B2 cria vínculo; escopo sempre usa membership existente |
| OWNER explícito | Perfil de unidade não substitui autoridade organizacional |
| Designação de OWNER | Exige OWNER organizacional ativo |
| Último OWNER | Revogação bloqueada quando resta apenas um |
| Autoelevação | Ator não pode alterar a própria configuração nem delegar acima do seu nível |
| ADMINISTRATOR | Sem `security.owner.manage` e sem `billing.manage`; escopo pela unidade/organização |
| AUDITOR | 23 permissões somente leitura; nenhuma financeira por padrão |
| Finanças | Exigem ALLOW individual explícito; permissões estruturais indelegáveis continuam bloqueadas |
| Auditoria | Ativação, rollback e autoridade geram eventos na mesma transação lógica |
| Multi-tenant | Repositórios exigem estabelecimento ativo e organização correspondente |

As menções a capacidades de billing no catálogo são vocabulário de autorização e não integram runtime, Stripe, rotas ou serviços de billing nesta subetapa.

## 9. Testes executados

Comandos foram executados somente no worktree isolado, com:

```text
DATABASE_URL -> PostgreSQL em 127.0.0.1:1, propositalmente inalcançável
USER_PERMISSIONS_ENABLED=false
USER_PERMISSIONS_KILL_SWITCH=false
JWT_SECRET -> valor exclusivamente local de teste
NODE_PATH -> dependências já instaladas no workspace original
```

Arquivos executados:

```text
legacyAdminAuth.test.js
legacyAuthorizationParity.test.js
organizationAuthority.test.js
permissionContracts.test.js
permissionPersistence.test.js
permissionResolver.test.js
userAccessConfiguration.test.js
```

Resultado final:

```text
29 aprovados
0 falhas
0 ignorados
0 cancelados
```

O primeiro ensaio encerrou com falhas seguras: três arquivos não puderam carregar `@prisma/client` porque o worktree não possui dependências, e o snapshot revelou os números antigos de rotas. Não houve tentativa de instalação nem conexão. Depois da reconciliação do teste e do uso read-only das dependências existentes, a execução foi integralmente aprovada.

Também foram executados:

- `node --check` em 25 arquivos: 25 aprovados;
- `git diff --check`: aprovado;
- `prisma validate` com URL forçada para loopback inválido: schema válido.

Nenhum teste de integração, HTTP, banco, migration, seed ou replay foi executado.

## 10. Integridade de migrations e schema

| Verificação | Resultado |
|---|---|
| Migrations | 60 |
| Nomes duplicados | 0 |
| Nove migrations B2.18.1 versus origem | 9/9 hashes idênticos |
| Migrations rastreadas da base modificadas | 0 |
| Hash do schema antes/depois da B2.18.2 | `47b44778697099f55625d02c9b98dfb3f0d3bf93ebf716787425d5ae705ce8af` |
| Prisma validate | Aprovado |
| Staging | Vazio |

As oito divergências de precisão decimal, o default de `organization_subscriptions.updatedAt`, índices parciais e decisões de lock continuam pendentes e não foram alterados.

## 11. Alterações e limites

Além dos artefatos já existentes da B2.18.1, foram alterados/criados somente:

- 14 arquivos exclusivos de runtime B2;
- quatro arquivos compartilhados autorizados;
- sete testes diretamente relacionados;
- este relatório.

Não foram modificados `package.json`, lockfile, dependências, reservas, estoque, billing/Stripe ou qualquer arquivo no working tree original.

## 12. Riscos remanescentes

| Criticidade | Risco | Gate |
|---|---|---|
| Crítica | Credencial PostgreSQL anteriormente exposta | Rotacionar antes de operação remota |
| Alta | B2.14 read-only ainda não executada | Auditar história/estrutura real antes de versionar ou aplicar |
| Alta | Código B2 testado somente de forma unitária/estática | Validar integração local completa em etapa autorizada |
| Alta | Runtime de billing não integrado, embora schema/migration estejam presentes | Integração e decisão separadas |
| Alta | Base Render Live permanece em `a459869`, anterior à base de integração | Não confundir código integrado com release ativo |
| Média | Worktree reutiliza dependências instaladas fora dele para testes | Instalação/lockfile só em etapa autorizada |
| Média | Quatro Prisma Clients existentes na base não foram consolidados | Avaliar separadamente; fora do escopo B2.18.2 |

## 13. GO/NO-GO

### GO condicionado

- aceitar a integração seletiva do código B2 e a dependência `validateParams.js`;
- aceitar a paridade LEGACY das 176 rotas internas da base remota;
- autorizar futuramente a próxima unidade local de integração mediante allowlist explícita;
- manter PROFILED desativado até validações posteriores.

### NO-GO

- staging, commit, push, merge, rebase ou cherry-pick;
- Supabase, Render, migration, seed ou replay;
- ativação de PROFILED ou migração de usuários;
- integração implícita de billing/Stripe;
- deploy ou Fase C.

Execução encerrada no limite autorizado da B2.18.2. Aguardando revisão.
