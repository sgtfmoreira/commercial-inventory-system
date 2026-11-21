# BASTIDOR OS — B2.18.6B: Backend de usuários e permissões

> Data: 13 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> Base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **implementação local concluída; 265/265 testes backend aprovados; primeiro OWNER e concorrência PostgreSQL real permanecem bloqueados**

## 1. Resultado executivo

O backend de usuários e permissões foi reconciliado para suportar acesso explícito por estabelecimento, perfis diferentes por unidade, limite organizacional de dez pessoas ativas e administração transacional de autoridades OWNER já inicializadas.

O modo de autorização continua `LEGACY`. Perfis B2 e overrides são preparados como `DRAFT`; nenhuma operação desta etapa ativa `PROFILED`.

Também foi eliminada a concessão automática de acesso a todos os usuários quando uma nova unidade é criada. Somente o usuário `ADMIN` que executa explicitamente a criação recebe o vínculo inicial `ADMIN` na nova unidade, dentro da mesma transação e com evento de auditoria. Vínculos existentes não são removidos nem modificados.

Resultados finais:

- testes focados: **46/46 aprovados**;
- suíte backend completa: **265/265 aprovados**;
- schema Prisma válido e com hash preservado;
- 60 migrations preservadas;
- staging vazio;
- nenhum banco, serviço externo, migration, seed, replay ou script operacional executado.

Decisão: **GO condicionado para planejar e executar a B2.18.6C mediante autorização própria. NO-GO para publicação, PROFILED, bootstrap do primeiro OWNER ou alegação de concorrência comprovada em PostgreSQL real.**

## 2. Gates e isolamento

| Gate | Resultado |
|---|---|
| Worktree/branch/HEAD | Confirmados |
| HEAD | `251d45bee486fc1af41e6ba2cff5ccc896dafc56` |
| Staging | Vazio |
| Migrations | 60, sem nomes duplicados |
| Schema SHA-256 | `47b44778697099f55625d02c9b98dfb3f0d3bf93ebf716787425d5ae705ce8af` |
| `prisma validate` | Aprovado com datasource em loopback inválido |
| Autorização padrão | `LEGACY` |
| PROFILED | Desativado por flag e kill switch nos testes |
| Supabase/Render/Stripe | Nenhuma conexão |
| Working tree original | Preservado; nenhuma edição ou staging |

## 3. Arquivos modificados na B2.18.6B

### Runtime

1. `backend/src/services/userService.js`
2. `backend/src/controllers/userController.js`
3. `backend/src/services/organizationAuthorityService.js`
4. `backend/src/controllers/userAccessController.js`
5. `backend/src/routes/userAccessRoutes.js`
6. `backend/src/validations/userAccessValidation.js`
7. `backend/src/controllers/establishmentController.js`

### Testes

8. `backend/test/userService.test.js`
9. `backend/test/userController.test.js`
10. `backend/test/organizationAuthority.test.js`
11. `backend/test/legacyAuthorizationParity.test.js`
12. `backend/test/organizationBillingFlow.test.js`

`backend/src/routes/userRoutes.js` e `backend/test/userAccessConfiguration.test.js` foram inspecionados, mas não exigiram alteração nesta subetapa.

Nenhum arquivo de frontend, schema ou migration foi modificado.

## 4. Usuários e limite organizacional

O serviço agora recebe uma lista explícita de acessos. Cada item contém o estabelecimento, o papel LEGACY e, opcionalmente, perfil B2 e overrides.

Regras implementadas:

- cada estabelecimento solicitado precisa ser ativo e pertencer à organização da sessão;
- o ator precisa possuir vínculo `ADMIN` ativo em cada unidade administrada;
- estabelecimentos repetidos são rejeitados;
- nenhum acesso é propagado para unidades não selecionadas ou criadas no futuro;
- uma mesma pessoa com várias unidades conta uma única vez no limite;
- o 11º usuário ativo é rejeitado;
- a reativação de uma pessoa totalmente inativa também respeita o limite;
- organizações legadas acima do limite não sofrem exclusão ou desativação automática;
- alterações de pessoas já ativas não são bloqueadas apenas por a organização estar acima do limite;
- criação e reativação usam transação `Serializable` e repetem conflitos `P2034`/`40001` até três vezes;
- o último `ADMIN` ativo de uma unidade não pode ser removido;
- o próprio ator não pode editar ou desativar seu acesso por esse fluxo;
- usuários com autoridade OWNER ativa precisam ter essa autoridade transferida ou revogada antes de perder todos os acessos.

O limite é aplicado sobre usuários distintos com ao menos um vínculo ativo em estabelecimento ativo da organização.

## 5. Acesso por estabelecimento e compatibilidade LEGACY

Os endpoints CRUD existentes de `/api/users` foram preservados:

```text
POST   /api/users
GET    /api/users
PUT    /api/users/:id
DELETE /api/users/:id
```

O contrato antigo com um único `role` continua mapeando exclusivamente para o estabelecimento ativo da sessão. O contrato novo aceita `accesses`, permitindo:

- uma ou várias unidades selecionadas explicitamente;
- papel LEGACY diferente por unidade;
- perfil B2 diferente por unidade;
- overrides `ALLOW`/`DENY` por unidade;
- manutenção do modo `LEGACY` enquanto o perfil permanece em `DRAFT`.

A listagem retorna somente usuários e vínculos das unidades em que o ator possui administração `ADMIN` ativa. A edição explícita sincroniza apenas unidades administráveis pelo ator e preserva vínculos fora do seu alcance.

## 6. Autoridade OWNER

Foram implementadas operações para organizações que já possuam ao menos um OWNER explícito e ativo:

```text
GET    /api/user-access/owners
POST   /api/user-access/owners/:userId
DELETE /api/user-access/owners/:userId
POST   /api/user-access/owners/:userId/transfer
```

Controles aplicados:

- somente OWNER explícito e ativo da mesma organização pode listar, designar, revogar ou transferir autoridade;
- o middleware LEGACY continua exigindo `ADMIN`, mas a verificação organizacional adicional ocorre no service;
- autoelevação é rejeitada;
- alvo precisa possuir vínculo ativo na mesma organização;
- alvo cross-tenant é rejeitado;
- o último OWNER ativo não pode ser revogado;
- autorrevogação direta é rejeitada;
- transferência ativa o destino e revoga a origem atomicamente;
- designação, revogação e transferência usam transação `Serializable` com retry;
- todas as mudanças gravam `security_audit_events` na mesma transação;
- métodos de verificação são validados e motivos de revogação/transferência são obrigatórios.

### Primeiro OWNER

Não foi criado endpoint público, promoção automática de `ADMIN` nem segredo improvisado de bootstrap. Sem OWNER ativo, as operações de designação falham fechadas.

A designação do primeiro OWNER continua bloqueada até ser definida uma cerimônia administrativa externa, autenticada, auditável e autorizada nominalmente. Esse bloqueio é intencional.

## 7. Criação de novos estabelecimentos

O comportamento antigo foi removido:

```text
nova unidade -> copiar todos os usuários da organização
```

O comportamento atual é:

```text
ADMIN autenticado cria unidade
  -> cria unidade e categorias
  -> cria somente o vínculo ADMIN do criador
  -> grava ESTABLISHMENT_INITIAL_ADMIN_GRANTED
  -> mantém sincronização de faturamento existente
```

O vínculo inicial é necessário para que o criador autorizado consiga administrar a unidade. Ele não concede acesso a terceiros, não modifica vínculos anteriores e registra ator, organização, unidade, vínculo-alvo e modo `LEGACY` no evento de auditoria.

O teste que falhou inicialmente exigia explicitamente a propagação antiga. A investigação confirmou que os outros 29 casos focados daquele ciclo já passavam. O snapshot foi substituído por verificações que proíbem `createMany`/propagação e exigem o vínculo individual auditado. Após a correção, os testes focados chegaram a 46/46.

## 8. Testes

### Focados

Arquivos executados:

```text
userService.test.js
userController.test.js
organizationAuthority.test.js
userAccessConfiguration.test.js
organizationBillingFlow.test.js
legacyAuthorizationParity.test.js
```

Resultado:

```text
46 aprovados
0 falhas
```

Cobertura principal:

- ausência de bootstrap implícito;
- designação, revogação e transferência OWNER;
- último OWNER e autoelevação;
- cross-tenant;
- limite de dez e tentativa do 11º;
- reativação;
- retry serializável unitário;
- unidades explícitas e perfis diferentes;
- preservação LEGACY;
- ausência de propagação para nova unidade;
- concessão inicial exclusiva e auditada ao criador.

### Suíte backend completa

Foi criada uma instalação temporária pelo lockfile com lifecycle desativado. Versões efetivas:

```text
Node.js:       24.19.0
Prisma/Client: 5.22.0
Zod:           3.25.76
Stripe:        23.0.1
```

O Prisma Client foi gerado com engines locais 5.22.0 e datasource apontado para `127.0.0.1:1`. Nenhuma conexão foi aberta.

Resultado final:

```text
arquivos:    59
testes:      265
aprovados:   265
falhas:      0
cancelados:  0
ignorados:   0
```

Uma primeira execução ampla obteve 264/265 porque a cópia temporária não reproduziu o diretório irmão `src/pages/Users.js` esperado por um teste estático. Após corrigir somente o layout do harness, a mesma suíte passou 265/265 sem alteração funcional adicional.

## 9. Limite da evidência de concorrência

Os testes unitários comprovam:

- uso de isolamento `Serializable`;
- retry de conflito serializável;
- rejeição do limite antes da criação;
- atomicidade lógica das operações OWNER.

Eles não comprovam duas transações PostgreSQL reais concorrendo. Conforme a autorização recebida, nenhum PostgreSQL local foi iniciado nesta subetapa. A prova real de que dois cadastros simultâneos não produzem o 11º usuário continua pendente de autorização específica para banco local descartável.

## 10. Integridade e restrições

| Verificação | Resultado |
|---|---|
| `node --check` nos arquivos alterados | Aprovado |
| `git diff --check` | Aprovado |
| `prisma validate` | Aprovado |
| Schema SHA-256 | Preservado |
| Migrations | 60, preservadas |
| Staging | Vazio |
| LEGACY | Preservado |
| PROFILED | Não ativado |
| Migration/seed/replay/reparação | Não executados |
| Supabase/Render/Stripe | Não acessados |
| Commit/push/deploy | Não executados |

## 11. Pendências e riscos

| Criticidade | Item | Gate |
|---|---|---|
| Crítica | Primeiro OWNER ainda não possui cerimônia administrativa | Definir processo externo seguro antes de uso operacional |
| Crítica | Credencial PostgreSQL anteriormente exposta | Rotacionar antes de qualquer operação remota |
| Alta | Concorrência do limite provada apenas por unidade/mocks | Teste PostgreSQL local descartável autorizado |
| Alta | Interface B2 de usuários ainda não implementada | B2.18.6C com allowlist de frontend |
| Alta | B2.14 read-only pendente | Confirmar história/checksums reais antes de publicação |
| Alta | PROFILED permanece deliberadamente desativado | Ativação exige fase e autorização próprias |
| Média | Organizações legadas acima de dez ficam bloqueadas para novas pessoas/reativações | Definir tratamento operacional, sem desativação automática |
| Média | Oito divergências decimais e default de billing permanecem | Decisão separada, sem correção por inferência |

## 12. GO/NO-GO

### GO condicionado para B2.18.6C

- backend local aprovado com 265/265 testes;
- contratos para acessos explícitos, perfis, drafts e autoridades disponíveis;
- LEGACY e kill switch preservados;
- frontend pode ser planejado sem ativar PROFILED e sem oferecer bootstrap inseguro do primeiro OWNER;
- B2.18.6C exige autorização e allowlist próprias.

### NO-GO

- iniciar B2.18.6C automaticamente;
- ativar PROFILED;
- publicar, fazer staging, commit, push ou deploy;
- executar bootstrap do primeiro OWNER sem cerimônia aprovada;
- considerar mocks prova de concorrência PostgreSQL real;
- conectar a banco ou serviço remoto;
- executar migration, seed, replay ou script de reparação.

B2.18.6B encerrada no limite autorizado. Aguardando revisão antes da B2.18.6C.
