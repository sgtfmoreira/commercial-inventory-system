# BASTIDOR OS — Estado atual de usuários e permissões

> Data: 14 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> HEAD/base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado geral: **módulo backend/frontend implementado e validado localmente; ambiente navegável ativo; publicação, PROFILED e primeiro OWNER continuam bloqueados**

## 1. Resumo executivo

O módulo de usuários e permissões chegou a um estado funcional para validação local:

- backend de usuários, acessos explícitos e autoridade OWNER implementado;
- frontend administrativo implementado e integrado aos contratos reais;
- limite de dez usuários comprovado com concorrência PostgreSQL real;
- isolamento multi-tenant, DRAFT, preview, histórico, rollback e auditoria validados;
- modo LEGACY preservado como autorização efetiva;
- ambiente local descartável atualmente disponível para revisão do produto.

Ainda não estamos prontos para publicação. Os bloqueios principais são:

1. usuários totalmente inativos desaparecem da listagem e não podem ser reativados pela interface;
2. deep links como `/users` retornam 404 quando abertos ou recarregados diretamente;
3. a suíte frontend não é reproduzível pelo lockfile porque falta `@testing-library/jest-dom`;
4. o primeiro OWNER continua sem implementação operacional, pois a autenticação FIDO2 não foi comprovada;
5. PROFILED permanece deliberadamente desativado;
6. gates remotos e operacionais anteriores — incluindo rotação da credencial PostgreSQL exposta — continuam pendentes.

Decisão atual: **GO para revisão manual local e para planejar correções específicas. NO-GO para staging, commit, deploy, publicação, ativação PROFILED, migration 61 ou bootstrap real do primeiro OWNER.**

## 2. Estado técnico confirmado

| Item | Estado atual |
|---|---|
| Branch isolada | `integration/bastidor-permissions-b2` |
| HEAD | `251d45bee486fc1af41e6ba2cff5ccc896dafc56` |
| Staging | Vazio |
| Entradas acumuladas no working tree antes deste relatório | 92 |
| Schema SHA-256 | `47b44778697099f55625d02c9b98dfb3f0d3bf93ebf716787425d5ae705ce8af` |
| Migrations | 60; nenhuma migration 61 |
| Working tree original | `feat/user-permissions-migration-plan` / `288de0c86262bb4a1602a418bf5b36060cbe3ddf` |
| Staging do original | Vazio |
| PROFILED efetivo | Desativado |
| Primeiro OWNER operacional | Não implementado nem executado |

As alterações acumuladas pertencem às fases B2 anteriores autorizadas. Não há arquivos staged em nenhum dos dois working trees.

## 3. Ambiente local ativo

Os três componentes foram verificados novamente:

```text
frontend:   http://localhost:3000/              HTTP 200
backend:    http://127.0.0.1:3333               login HTTP 200
PostgreSQL: 127.0.0.1:55440 / bastidor_b219     accepting connections
```

Credenciais fictícias principais:

```text
e-mail: owner.qa@bastidor.local
senha:  LocalVisual!219
```

O frontend deve ser aberto por `http://localhost:3000/`. A origem `http://127.0.0.1:3000` não está na allowlist CORS atual.

O banco é local e descartável, contém somente fixtures sintéticas e possui as 60 migrations existentes. Nenhuma credencial ou dado remoto é utilizado.

## 4. Linha do tempo consolidada

### B2.18.6A — Runtime e dependências

- instalação limpa pelo lockfile;
- Node mínimo ajustado para `>=20`;
- build/start separados de migration e seed;
- Prisma Client 5.22 regenerado;
- 257/257 testes backend e 34/34 frontend aprovados naquele gate.

### B2.18.6B — Backend de usuários e permissões

- acessos explícitos por estabelecimento;
- papéis LEGACY e perfis B2 distintos por unidade;
- overrides ALLOW/DENY em DRAFT;
- limite organizacional de dez pessoas ativas;
- transações Serializable com retry;
- proteção do último administrador e do último OWNER;
- designação, revogação e transferência normal de OWNER;
- remoção da propagação automática para novos estabelecimentos;
- vínculo inicial auditado somente para o criador autorizado;
- 265/265 testes backend aprovados.

### B2.18.6C — Interface administrativa

- listagem, busca e filtros;
- contador de ativos visíveis;
- cadastro e edição por unidade;
- perfis e overrides por estabelecimento;
- DRAFT, preview, histórico e rollback;
- consulta/administração normal de OWNER;
- nomenclatura `STOCK_COUNTER = Contador de estoque` corrigida;
- ativação PROFILED mantida desabilitada;
- 43/43 testes frontend e 265/265 backend aprovados no ambiente usado naquele gate.

### B2.18.7 — Validação integrada PostgreSQL

- PostgreSQL 16.14 descartável;
- replay das 60 migrations;
- cadastro simultâneo com nove ativos terminou em exatamente dez;
- reativação simultânea terminou em exatamente dez;
- revogação e transferência OWNER concorrentes preservaram um OWNER;
- isolamento cross-tenant e auditoria append-only comprovados;
- 265/265 backend e 43/43 frontend registrados.

### B2.18.8 — Cerimônia do primeiro OWNER

- arquitetura interna/CLI desenhada;
- proposta simplificada para operação centralizada pela equipe Bastidor;
- assinatura OpenSSH comum, replay, expiração e auditoria Git local comprovados;
- FIDO2 real, user presence e user verification não comprovados;
- migration 61 e implementação permanecem bloqueadas;
- nenhum bootstrap ou OWNER real foi criado.

### B2.19 — Validação visual e funcional

- React, backend e PostgreSQL iniciados localmente;
- navegador real validou login, dashboard e página de usuários em desktop/mobile;
- 11/11 ensaios HTTP + PostgreSQL aprovados;
- 46/46 testes backend relevantes aprovados;
- fixture-base restaurada e mantida disponível;
- três bloqueios de produto/reprodutibilidade identificados.

## 5. Funcionalidades disponíveis

### Usuários

- cadastro em uma ou várias unidades selecionadas explicitamente;
- papéis LEGACY diferentes por unidade;
- perfis B2 diferentes por unidade;
- edição sem remover vínculos fora do alcance do administrador;
- desativação de vínculos autorizados;
- limite real de dez pessoas ativas por organização;
- proteção contra o 11º cadastro e contra reativação acima do limite;
- proteção contra concorrência PostgreSQL;
- bloqueio cross-tenant.

### Perfis e permissões

- seis perfis: OWNER, ADMINISTRATOR, MANAGER, SUPERVISOR, COLLABORATOR e AUDITOR;
- AUDITOR atende consultores nesta versão;
- OWNER não pode ser atribuído pelo cadastro comum;
- overrides individuais ALLOW/DENY;
- configuração em DRAFT;
- preview de diferenças;
- histórico auditável;
- optimistic locking;
- rollback para LEGACY.

### Autoridade OWNER

Para organizações já inicializadas:

- listar OWNERs;
- designar outro OWNER;
- revogar OWNER sem remover o último;
- transferir autoridade atomicamente;
- impedir autoelevação, autorrevogação e operações cross-tenant;
- auditar todas as alterações.

Não existe endpoint público nem promoção automática para criar o primeiro OWNER.

## 6. Evidências de qualidade

| Evidência | Resultado |
|---|---|
| Backend completo, último gate reproduzível | 265/265 |
| Backend relevante na B2.19 | 46/46 |
| Frontend, último gate aprovado | 43/43 |
| Ensaios integrados B2.19 | 11/11 |
| Concorrência PostgreSQL real | Aprovada |
| Isolamento multi-tenant | Aprovado |
| Migrations reproduzidas | 60/60 |
| PROFILED ativado durante validação | Não |
| Bootstrap real executado | Não |

Ressalva: a execução frontend limpa mais recente não carregou porque `@testing-library/jest-dom` não está declarado no `package.json`/lockfile. Os 43 testes permanecem como evidência do gate anterior, mas a reprodutibilidade atual precisa ser corrigida.

## 7. Bloqueios atuais

### Críticos/altos

| Item | Consequência | Gate necessário |
|---|---|---|
| Usuários totalmente inativos não aparecem | reativação impossível pela UI | corrigir contrato/listagem e criar testes cross-tenant |
| Deep link `/users` retorna 404 | refresh e bookmark quebram | configurar fallback seguro para React |
| Dependência Jest ausente no lockfile | testes frontend limpos não executam | atualizar package/lockfile e repetir suíte completa |
| Primeiro OWNER sem FIDO2 comprovado | bootstrap operacional bloqueado | teste com hardware real ou mecanismo equivalente aprovado |
| Credencial PostgreSQL anteriormente exposta | operação remota insegura | rotação antes de qualquer acesso remoto |
| B2.14 read-only pendente | história/checksums remotos não confirmados | etapa read-only autorizada |

### Médios

- diferença visual entre modo persistido PROFILED e modo efetivo LEGACY;
- página de usuários muito longa em desktop/mobile;
- contador completo da organização não é visível para administrador parcial;
- warning `Modal.maxWidth` permanece;
- acessibilidade instrumental ainda não foi auditada;
- oito divergências decimais e default de billing continuam fora do escopo.

## 8. Estado da cerimônia do primeiro OWNER

A frente está deliberadamente estacionada.

Comprovado:

- desafios OpenSSH comuns;
- assinatura/verificação;
- proteção de replay e expiração;
- revogação por cadastro interno;
- identidade canônica por `personId`;
- recibos Git locais, hashes e retomada idempotente.

Não comprovado:

- chave `ed25519-sk` real;
- user presence e user verification;
- PIN/MFA de hardware;
- duas pessoas físicas com dispositivos diferentes;
- role mínima da workload;
- ancoragem externa protegida/WORM.

Portanto, continuam proibidos:

- alteração do schema para os modelos da cerimônia;
- criação da migration 61;
- implementação ou execução da CLI operacional;
- bootstrap do primeiro OWNER.

## 9. Próxima sequência recomendada

### Prioridade 1 — Encerrar B2.19 funcionalmente

1. concluir o checklist manual com o responsável do produto;
2. registrar defeitos visuais e mensagens inadequadas;
3. autorizar allowlist específica para:
   - listagem/reativação de inativos;
   - fallback de deep links;
   - dependência de testes frontend;
4. repetir testes frontend completos, backend completo e ensaios integrados.

### Prioridade 2 — Preparação de publicação

1. rotacionar a credencial PostgreSQL exposta;
2. executar B2.14 read-only autorizada;
3. revisar observabilidade, rollback e flags;
4. manter PROFILED desligado até fase própria.

### Prioridade 3 — Primeiro OWNER

Retomar somente quando houver:

- hardware FIDO2 compatível e duas pessoas internas;
- prova UP/UV/PIN;
- decisão formal sobre auditoria externa;
- nova autorização para schema e migration 61.

## 10. GO/NO-GO atual

### GO

- continuar a validação manual no ambiente local;
- corrigir os bloqueios da B2.19 mediante allowlist explícita;
- manter testes e operações somente em PostgreSQL descartável;
- preparar um plano separado de publicação.

### NO-GO

- publicação, deploy, push, merge, commit ou staging;
- ativação PROFILED;
- bootstrap do primeiro OWNER;
- migration 61;
- conexão a Supabase, Render, Stripe ou banco remoto;
- uso da credencial PostgreSQL anteriormente exposta;
- alteração das 60 migrations existentes;
- tratar o módulo como pronto para produção antes das correções P0.

## 11. Conclusão

O núcleo de usuários e permissões está tecnicamente sólido e demonstrado em ambiente local real, inclusive sob concorrência PostgreSQL. A interface está navegável e pronta para revisão de produto. O trabalho agora deixou de ser principalmente arquitetural: a prioridade é corrigir três lacunas concretas de operação — reativação de inativos, deep links e reprodutibilidade dos testes frontend — e então repetir a validação integrada.

A cerimônia do primeiro OWNER e PROFILED devem continuar separados dessa correção e permanecem em NO-GO.
