# BASTIDOR OS — B2.20.1: Laboratório PROFILED isolado

> Data: 15 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> HEAD/base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **B2.20.2: correção CORS aprovada; backend PROFILED e preflight CORS comprovados; frontend paralelo bloqueado por encerramento silencioso da compilação**

## 1. Resultado executivo

O banco paralelo foi criado com sucesso e permanece estritamente local:

```text
PostgreSQL: 16.14
host:       127.0.0.1
port:       55441
database:   bastidor_b2201_profiled
role:       bastidor_b2201_admin
migrations: 60/60
```

As fixtures sintéticas dos seis perfis foram criadas nesse banco. Entretanto, uma das verificações obrigatórias falhou antes da inicialização dos serviços:

```text
origem necessária: http://localhost:3001
origens aceitas pelo backend:
  http://localhost:3000
  https://commercial-inventory-system.vercel.app
```

O backend não possui configuração de CORS por variável de ambiente. Assim, um frontend em `localhost:3001` apontando diretamente ao backend 3334 seria bloqueado pelo navegador.

Conforme a autorização B2.20.1, a execução foi interrompida antes de iniciar PROFILED. Não foram iniciados backend 3334 ou frontend 3001, não foram executados testes HTTP/navegador e nenhuma divergência foi corrigida.

## 2. Allowlist e alterações

Allowlist persistente respeitada:

```text
USER_PERMISSIONS_PHASE_B2_20_1_PROFILED_LAB_REPORT.md
```

Nenhum código funcional, teste, schema, migration, manifesto, lockfile ou configuração compartilhada foi alterado.

Arquivos temporários foram criados somente em:

```text
C:\Users\Moreira\AppData\Local\Temp\bastidor-b2201-20261115
```

Eles contêm o cluster PostgreSQL, uma cópia descartável do harness e o fixture local. Não pertencem ao worktree.

## 3. Gates de isolamento

| Gate obrigatório | Resultado |
|---|---|
| Backend 3334 usaria exclusivamente o banco 55441 | Preparado, mas backend não iniciado |
| Frontend 3001 apontaria exclusivamente ao backend 3334 | **Falhou: CORS rejeita a origem 3001** |
| B2.19.1 permanece LEGACY com kill switch ativo | Confirmado por HTTP: fixture com `DENY products.read` continuou recebendo 200 |
| Nenhuma URL/credencial remota | Confirmado |
| Configurações independentes | Banco e diretórios independentes; processos paralelos não iniciados |
| Nenhum arquivo compartilhado de configuração alterado | Confirmado |

O PostgreSQL escuta somente em `127.0.0.1`. O banco contém apenas dados fictícios.

## 4. Replay das migrations

O Prisma Client estava disponível localmente, mas o engine de migrations não estava presente. A tentativa de `prisma migrate deploy` tentou consultar `binaries.prisma.sh` e foi bloqueada; nenhum download foi autorizado ou realizado.

Para não acessar rede, os 60 arquivos `migration.sql` existentes foram executados em ordem com `psql`, com `ON_ERROR_STOP=1`. Cada migration concluída foi registrada em `_prisma_migrations` com:

- nome original;
- SHA-256 do arquivo;
- timestamp de início/conclusão;
- `applied_steps_count = 1`.

Resultado:

```text
primeira: 20260304193850_init
última:   20261107131000_restore_commercial_supporting_indexes
total:    60
falhas:   0
migration 61: inexistente
```

Nenhuma migration foi criada ou modificada.

## 5. Fixtures preparadas

Organizações fictícias:

- `Bastidor PROFILED Lab`;
- `Tenant Vizinho PROFILED`.

Estabelecimentos:

- `Central PROFILED`;
- `Norte PROFILED`;
- `Restrita PROFILED`, sem vínculo dos seis usuários;
- `Vizinha PROFILED`, pertencente ao tenant vizinho.

Usuários configurados em `Central` e `Norte`:

| Perfil | E-mail | Papel LEGACY da fixture |
|---|---|---|
| OWNER | `owner.profiled@bastidor.local` | ADMIN |
| ADMINISTRATOR | `administrator.profiled@bastidor.local` | STAFF |
| MANAGER | `manager.profiled@bastidor.local` | STAFF |
| SUPERVISOR | `supervisor.profiled@bastidor.local` | STAFF |
| COLLABORATOR | `collaborator.profiled@bastidor.local` | STAFF |
| AUDITOR | `auditor.profiled@bastidor.local` | STAFF |

Senha local comum:

```text
ProfiledLocal!2201
```

Casos adicionais preparados:

- `noactive.profiled@bastidor.local`: modo PROFILED sem configuração ACTIVE;
- `neighbor.profiled@bastidor.local`: OWNER sintético do tenant vizinho;
- `COLLABORATOR`: override `DENY recipes.read`;
- `AUDITOR`: override delegável `ALLOW reports.financial.read`;
- OWNER organizacional sintético criado diretamente para a organização do laboratório.

Esses registros não constituem bootstrap operacional. Nenhum serviço está consumindo o banco neste momento.

## 6. Serviços e URLs

### Ambiente B2.19.1 preservado

```text
frontend: http://localhost:3000/       ativo
backend:  http://127.0.0.1:3333        ativo
banco:    127.0.0.1:55440/bastidor_b219
modo:     LEGACY efetivo
```

### Laboratório B2.20.1

```text
PostgreSQL: 127.0.0.1:55441/bastidor_b2201_profiled ativo
backend:    http://127.0.0.1:3334 não iniciado
frontend:   http://localhost:3001/ não iniciado
```

Não se deve tentar login pelos endereços 3334/3001 até resolver o gate CORS.

## 7. Testes executados e não executados

Executados:

- identidade e porta do PostgreSQL paralelo;
- replay 60/60;
- criação das fixtures dos seis perfis;
- confirmação de que o B2.19.1 continua efetivamente LEGACY;
- inspeção da configuração CORS real.

Não executados devido ao gate:

- login dos seis perfis no backend 3334;
- troca de estabelecimento;
- matriz de leitura/escrita/negação;
- isolamento HTTP entre unidades e tenants;
- persistência das operações funcionais;
- overrides em enforcement real;
- finanças, autoelevação e último OWNER por HTTP;
- kill switch do processo de laboratório;
- navegador desktop/mobile e capturas de tela.

Portanto, não há resultado por perfil a declarar nesta etapa.

## 8. Defeito identificado

### Alta — CORS de desenvolvimento não é configurável

Arquivo responsável:

```text
backend/src/app.js
```

A lista de origens está fixa no código. Isso impede executar dois frontends locais independentes e também acopla a origem de produção ao código-fonte.

Impactos:

- bloqueia o laboratório 3001 → 3334;
- incentiva edição temporária de código para testes;
- dificulta validação de ambientes de preview/staging;
- aumenta o risco de permitir origem incorreta em publicação.

## 9. Propostas de correção — não executadas

### Recomendação

Tornar a allowlist CORS configurável por uma variável explícita, mantendo defaults seguros:

```text
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

No laboratório paralelo:

```text
CORS_ALLOWED_ORIGINS=http://localhost:3001
```

Requisitos da correção:

- lista separada por vírgulas, normalizada e sem wildcard;
- rejeitar valores inválidos na inicialização;
- não misturar automaticamente origens locais e remotas;
- preservar requisições sem `Origin` para clientes internos/testes;
- testes de aceitação e rejeição CORS;
- nenhuma mudança no mecanismo de autenticação.

Arquivos mínimos propostos para autorização separada:

```text
backend/src/app.js
backend/test/cors.test.js                  (novo)
USER_PERMISSIONS_PHASE_B2_20_1_PROFILED_LAB_REPORT.md
```

### Alternativa temporária não recomendada

Um proxy local poderia remover ou substituir o cabeçalho `Origin`, mas isso reduziria a fidelidade do teste de navegador e esconderia a configuração real. Não foi utilizado.

## 10. Estado de segurança

| Item | Estado |
|---|---|
| PROFILED em processo de aplicação | Não iniciado |
| PROFILED fora do banco descartável | Não |
| B2.19.1 alterado | Não |
| Supabase/Render/Stripe/GitHub remoto | Não acessados |
| Schema/migrations/lockfiles | Não alterados |
| Migration 61 | Não criada |
| Primeiro OWNER operacional | Não implementado/executado |
| Staging/commit/push/deploy | Não executados |

## 11. GO/NO-GO

### GO

- aceitar o banco paralelo e as fixtures preparadas;
- manter o PostgreSQL 55441 disponível para continuidade;
- autorizar separadamente a configuração CORS por ambiente;
- após a correção, reiniciar o preflight desde o começo.

### NO-GO atual

- iniciar backend PROFILED 3334;
- iniciar frontend 3001 como se estivesse integrado;
- declarar qualquer perfil validado ponta a ponta;
- usar proxy que masque o CORS;
- executar correção sem allowlist complementar;
- qualquer publicação ou acesso remoto.

B2.20.1 foi interrompida corretamente no preflight. A continuação autorizada na B2.20.2 está registrada abaixo.

## 12. B2.20.2 — Correção controlada de CORS

### 12.1 Arquivos alterados

```text
backend/src/app.js
backend/test/cors.test.js
USER_PERMISSIONS_PHASE_B2_20_1_PROFILED_LAB_REPORT.md
```

Nenhum caminho fora da allowlist B2.20.2 foi modificado nesta etapa.

### 12.2 Implementação

Foi introduzida a variável opcional:

```text
CORS_ALLOWED_ORIGINS
```

Comportamento implementado:

- lista separada por vírgulas;
- espaços e barra final de origem são normalizados;
- duplicatas são removidas;
- somente esquemas `http` e `https` são aceitos;
- wildcard, valor vazio e origem literal `null` são rejeitados;
- credenciais embutidas, caminhos, query strings e fragmentos são rejeitados;
- quando a variável não existe, a lista histórica permanece exatamente:

```text
http://localhost:3000
https://commercial-inventory-system.vercel.app
```

- uma configuração explícita substitui completamente o default;
- requisições realmente sem `Origin` continuam aceitas;
- preflight `OPTIONS` continua a cargo do middleware `cors` existente;
- JWT, autenticação, sessão e autorização não foram alterados.

### 12.3 Testes CORS

```text
testes:     9
aprovados:  9
falhas:     0
```

Casos aprovados:

1. origem permitida;
2. origem não permitida;
3. múltiplas origens e remoção de duplicatas;
4. valores inválidos, caminhos, query, fragmento e credenciais;
5. wildcard;
6. `Origin: null`;
7. preflight `OPTIONS`;
8. ausência de `Origin`;
9. compatibilidade sem variável.

As stack traces exibidas durante três casos pertencem às rejeições esperadas do middleware Express e não representam falhas.

### 12.4 Regressão backend

```text
testes:     275
aprovados:  275
falhas:       0
```

A contagem corresponde aos 266 testes anteriores mais os nove testes CORS.

## 13. Preflight B2.20.2

| Gate | Resultado |
|---|---|
| PostgreSQL exclusivo | `127.0.0.1:55441/bastidor_b2201_profiled` confirmado |
| Role exclusiva | `bastidor_b2201_admin` confirmada |
| Histórico | 60 registros finalizados; nomes e SHA-256 coincidem com os 60 arquivos |
| Estruturas B2 | 5/5 tabelas esperadas presentes |
| Dados | somente organizações e e-mails fictícios |
| `.env` no backend/frontend do laboratório | nenhum |
| Backend 3334 → banco 55441 | confirmado no processo iniciado |
| Frontend configurado → backend 3334 | variável exclusiva preparada |
| B2.19.1 | frontend/backend ativos; override negado continuou HTTP 200 em LEGACY |
| Serviços remotos | não acessados |
| CORS real 3001 → 3334 | preflight HTTP 204, ACAO `http://localhost:3001` |

Limitação explícita: a falta do engine local impediu `prisma migrate deploy/status`. Os 60 SQLs, seus hashes, as estruturas no PostgreSQL e os testes de persistência foram verificados, mas isso **não é apresentado como validação do Prisma Migrate**.

## 14. Inicialização dos serviços

O backend foi iniciado temporariamente com:

```text
host/porta:                    127.0.0.1:3334
DATABASE_URL:                  somente 127.0.0.1:55441/bastidor_b2201_profiled
USER_PERMISSIONS_ENABLED:      true
USER_PERMISSIONS_KILL_SWITCH:  false
CORS_ALLOWED_ORIGINS:          http://localhost:3001
```

Evidências:

```text
login OWNER fictício: HTTP 200
preflight da origem 3001: HTTP 204
Access-Control-Allow-Origin: http://localhost:3001
```

O segundo frontend foi tentado por três mecanismos, sempre com `REACT_APP_API_URL=http://127.0.0.1:3334`:

1. `npm start` em processo oculto;
2. `react-scripts start` direto em sessão supervisionada;
3. `react-scripts build` com sourcemap desabilitado e heap ampliado.

Nos três casos o processo encerrou com código 1 durante `Starting the development server` ou `Creating an optimized production build`, sem erro de compilação, stack trace ou arquivo ausente. A porta 3001 nunca foi aberta.

Para cumprir o gate obrigatório, o backend 3334 foi encerrado. O PostgreSQL 55441 permanece ativo com dados fictícios; frontend 3001 e backend 3334 estão desligados.

## 15. Matriz PROFILED

A matriz não foi executada parcialmente após a falha do frontend, conforme a regra de interrupção da B2.20.2.

| Perfil | Login | Troca | Leitura | Escrita | Negação | Tenant/unidade | Navegador |
|---|---|---|---|---|---|---|---|
| OWNER | Não executado | Não executado | Não executado | Não executado | Não executado | Não executado | Bloqueado |
| ADMINISTRATOR | Não executado | Não executado | Não executado | Não executado | Não executado | Não executado | Bloqueado |
| MANAGER | Não executado | Não executado | Não executado | Não executado | Não executado | Não executado | Bloqueado |
| SUPERVISOR | Não executado | Não executado | Não executado | Não executado | Não executado | Não executado | Bloqueado |
| COLLABORATOR | Não executado | Não executado | Não executado | Não executado | Não executado | Não executado | Bloqueado |
| AUDITOR | Não executado | Não executado | Não executado | Não executado | Não executado | Não executado | Bloqueado |

Nenhuma capacidade foi declarada aprovada sem execução efetiva.

## 16. Problemas B2.20.2

| Severidade | Problema | Estado |
|---|---|---|
| Alta | Segundo frontend encerra silenciosamente durante compilação enquanto o frontend B2.19.1 está ativo | Bloqueia navegador e matriz integrada |
| Média | Engine Prisma Migrate não está disponível localmente | Replay SQL validado, mas `migrate status` não comprovado |
| Resolvido | CORS fixo impedia origem 3001 | Corrigido e coberto por 9 testes |
| Conhecida | Frontend continua orientado por papel LEGACY, não capability | Correção fora desta etapa |

Proposta, sem execução: investigar o encerramento do compilador em uma etapa própria, medindo memória/process termination e testando uma cópia limpa completa fora dos dois ambientes ativos. Não se recomenda parar o B2.19.1, usar proxy que masque CORS ou alterar a interface por inferência.

## 17. URLs e credenciais

### Disponível agora

```text
B2.19.1 frontend: http://localhost:3000/
B2.19.1 backend:  http://127.0.0.1:3333
B2.20.2 banco:    127.0.0.1:55441/bastidor_b2201_profiled
```

### Indisponível até novo gate

```text
B2.20.2 frontend: http://localhost:3001/
B2.20.2 backend:  http://127.0.0.1:3334
```

Credenciais sintéticas já preparadas para a retomada:

```text
owner.profiled@bastidor.local
administrator.profiled@bastidor.local
manager.profiled@bastidor.local
supervisor.profiled@bastidor.local
collaborator.profiled@bastidor.local
auditor.profiled@bastidor.local

senha: ProfiledLocal!2201
```

## 18. GO/NO-GO B2.20.2

### GO

- aceitar a correção CORS;
- aceitar 9/9 testes CORS e 275/275 backend;
- preservar o banco/fixtures locais para retomada;
- planejar diagnóstico isolado do compilador frontend.

### NO-GO

- declarar os seis perfis validados ponta a ponta;
- manter backend PROFILED ativo sem frontend validado;
- executar matriz parcial como substituto do teste integrado;
- corrigir interface automaticamente;
- staging, commit, push, merge, deploy ou acesso remoto;
- migration 61 ou primeiro OWNER operacional.

B2.20.2 encerrada no gate de frontend. A correção CORS está aprovada localmente; a validação PROFILED continua pendente e nenhum serviço PROFILED permanece ativo.
