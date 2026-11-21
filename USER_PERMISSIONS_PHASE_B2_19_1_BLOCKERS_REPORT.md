# BASTIDOR OS — B2.19.1: Correção dos bloqueios da validação visual

> Data: 15 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> HEAD/base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **reativação corrigida; instalação frontend reproduzível; deep link validado como funcional; 44/44 testes frontend, 266/266 backend e 6/6 integrações aprovados**

## 1. Resultado executivo

A B2.19.1 encerrou os três bloqueios locais identificados na B2.19:

1. usuários totalmente inativos voltaram a aparecer para administradores das unidades às quais já estiveram vinculados e podem ser reativados pela interface existente;
2. navegação direta e refresh em `/users` foram comprovados com semântica real de navegador (`Accept: text/html`); o 404 anterior era um falso positivo de uma requisição sem esse cabeçalho e não exigiu mudança de servidor;
3. `@testing-library/jest-dom` foi declarado em `devDependencies`, fixado em `5.17.0` e registrado no lockfile; uma instalação limpa passou a executar toda a suíte frontend.

A correção de listagem não amplia o alcance administrativo. O backend continua derivando as unidades visíveis exclusivamente dos vínculos `ADMIN` ativos do ator dentro da organização atual. Vínculos inativos são retornados apenas quando pertencem a essas unidades administráveis. Usuários de outra organização e vínculos de unidades fora do alcance permanecem ocultos.

Resultados finais:

```text
frontend completo:       44/44
backend completo:       266/266
integração HTTP + PG:     6/6
migrations preservadas:  60/60
PROFILED ativado:            0
migration 61:                 não criada
```

Decisão: **GO para validação manual local. NO-GO permanece para commit, staging, publicação, deploy, PROFILED, migration 61 ou bootstrap real do primeiro OWNER.**

## 2. Inspeção e allowlist

A inspeção anterior à alteração identificou:

- listagem em `userService.list` filtrando a existência do usuário por vínculo ativo;
- atualização/reativação já protegida por transação `Serializable`, capacidade organizacional e escopo do ator;
- frontend já capaz de filtrar inativos, abrir o editor e selecionar novamente uma unidade;
- fallback de navegação já fornecido pelo servidor de desenvolvimento do Create React App;
- import de `@testing-library/jest-dom` em `src/setupTests.js`, mas sem declaração no manifesto e no lockfile.

Allowlist anunciada:

```text
backend/src/services/userService.js
backend/test/userService.test.js
src/pages/Users.test.js
package.json
package-lock.json
USER_PERMISSIONS_PHASE_B2_19_1_BLOCKERS_REPORT.md
```

Nenhum arquivo fora dessa allowlist foi alterado na B2.19.1. Não foi necessário modificar `Users.js`, controllers, rotas, servidor Express, configuração do React, schema ou migrations.

## 3. Usuários inativos e reativação

### Correção

O filtro externo da listagem deixou de exigir `isActive: true` no vínculo encontrado. Permaneceram inalterados:

- os IDs de estabelecimento, derivados somente de vínculos `ADMIN` ativos do ator;
- o filtro da organização no carregamento desses vínculos administrativos;
- a projeção de memberships limitada aos estabelecimentos administráveis;
- a validação cross-tenant;
- a preservação de vínculos fora do alcance;
- o limite de dez pessoas ativas;
- a transação `Serializable` e o retry de conflitos.

Consequência esperada:

```text
ator administra unidade A
  -> vê vínculos ativos e inativos da unidade A
  -> não vê vínculos da unidade B não administrável
  -> não vê usuários da organização vizinha
```

### Evidência PostgreSQL real

No banco descartável, a organização principal começou com nove pessoas ativas e um usuário totalmente inativo.

| Ensaio | Resultado |
|---|---|
| Listagem inicial | 10 pessoas visíveis: 9 ativas + 1 inativa |
| Organização vizinha | não exposta |
| Vínculo da unidade restrita | não exposto ao ator parcial |
| Reativação do inativo | HTTP 200; total ativo passou para 10 |
| Tentativa do 11º usuário | HTTP 409; total permaneceu 10 |
| Cadastro cross-tenant | HTTP 403 |
| Desativação de restauração | HTTP 204; total voltou para 9 |
| Nova listagem | usuário continuou visível como inativo |

O ensaio terminou com a fixture novamente em nove pessoas ativas. Nenhum usuário cross-tenant ou 11º usuário foi criado.

## 4. Deep links do React

O diagnóstico foi repetido com cabeçalhos equivalentes aos de uma navegação de navegador:

| Requisição | Resultado |
|---|---|
| `GET /` com `Accept: text/html` | 200, `text/html`, contém `#root` |
| `GET /users` com `Accept: text/html` | 200, `text/html`, contém `#root` |
| refresh de `GET /users` com `Accept: text/html` | 200, mesmo shell React |
| `GET /missing-static.js` com `Accept: application/javascript` | 404 |
| `GET /api/route-that-does-not-exist` no backend | 404 |

Conclusão: o servidor de desenvolvimento já implementa o fallback SPA somente para navegação HTML. A verificação anterior usou o `Accept` padrão do cliente PowerShell e recebeu corretamente 404. Não havia defeito de código a corrigir.

Nenhuma regra genérica foi adicionada; portanto, rotas API e arquivos estáticos inexistentes continuam sem ser mascarados. O fallback do futuro ambiente de publicação continua sendo responsabilidade da configuração específica do host e deve ser validado na fase de publicação.

## 5. Dependência de testes

Foi adicionada somente a dependência direta:

```json
"devDependencies": {
  "@testing-library/jest-dom": "5.17.0"
}
```

O mesmo valor aparece na raiz do lockfile e no pacote resolvido. A versão 5.17.0 é compatível com a pilha atual de Create React App/Jest 27 e com o import existente em `src/setupTests.js`.

Instalação limpa em diretório temporário fora de `.tools`:

```text
frontend: npm ci --ignore-scripts -> 1.443 pacotes
backend:  npm ci --ignore-scripts ->   171 pacotes
registry: oficial do npm
```

Nenhuma outra dependência direta foi adicionada. O worktree não recebeu `node_modules`.

## 6. Testes automatizados

### Frontend

```text
suítes:  9/9
testes: 44/44
falhas:  0
```

O novo caso de interação abre um usuário totalmente inativo, aplica o filtro `Inativos`, seleciona novamente a unidade e confirma o payload de reativação.

Permanece o warning preexistente de `Modal.maxWidth`, fora da allowlist.

### Backend

```text
testes: 266
aprovados: 266
falhas: 0
```

O novo teste inspeciona o contrato de consulta e comprova simultaneamente:

- ausência do filtro externo `isActive`;
- escopo pelos IDs administráveis;
- projeção somente das unidades administráveis.

Uma primeira execução temporária não encontrou `backend/scripts/repair-park-stock-locations.js` porque o diretório `scripts` não havia sido copiado para o harness. Após completar a cópia, a mesma suíte passou 266/266; não houve falha funcional nem alteração no projeto para contorná-la.

### Integração PostgreSQL

```text
checks:   6/6
login:    HTTP 200
switch:   HTTP 200
reativar: HTTP 200
11º:      HTTP 409
cross:    HTTP 403
restore:  HTTP 204
```

As verificações consultaram a persistência pelo Prisma Client e não usaram mocks de banco.

## 7. Ambiente local disponível

Estado confirmado em 15 de novembro de 2026:

```text
frontend:   http://localhost:3000/          HTTP 200
deep link:  http://localhost:3000/users     HTTP 200
backend:    http://127.0.0.1:3333           login HTTP 200
PostgreSQL: 127.0.0.1:55440 / bastidor_b219 accepting connections
```

Credencial fictícia principal:

```text
e-mail: owner.qa@bastidor.local
senha:  LocalVisual!219
```

O frontend deve ser acessado por `localhost`, pois essa é a origem local autorizada pelo CORS existente.

Flags do backend:

```text
USER_PERMISSIONS_ENABLED=false
USER_PERMISSIONS_KILL_SWITCH=true
```

### Encerramento dos serviços

Nesta execução, os processos confirmados são:

```text
backend Node:  PID 4900
frontend npm:  PID 13212
frontend Node: PID 15240
```

Eles podem ser encerrados com `Stop-Process` pelos IDs acima. O PostgreSQL descartável pode ser encerrado com:

```powershell
& 'C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe' `
  -D 'C:\Users\Moreira\AppData\Local\Temp\bastidor-b219-20261114\pgdata' `
  stop -m fast
```

Não remover o diretório temporário enquanto a validação manual estiver em andamento.

## 8. Checklist manual do produto

1. abrir `http://localhost:3000/users` diretamente;
2. confirmar que a tela carrega após autenticação e seleção de `Bistrô Central QA`;
3. filtrar o status por `Inativos`;
4. localizar `inativo.qa@bastidor.local`;
5. abrir `Editar` e confirmar que a unidade Central aparece desmarcada;
6. marcar a unidade, salvar e confirmar que o usuário fica ativo;
7. verificar o contador `10 / 10` e o bloqueio de novo cadastro;
8. editar novamente e remover o vínculo para restaurar a fixture a nove ativos;
9. atualizar o navegador em `/users` e confirmar que a rota permanece aberta;
10. confirmar que unidades não administráveis e a organização vizinha não aparecem.

## 9. Integridade

| Verificação | Resultado |
|---|---|
| Branch/HEAD isolados | confirmados |
| Staging no worktree isolado | vazio |
| Working tree original | preservado; staging vazio |
| Schema SHA-256 | `47b44778697099f55625d02c9b98dfb3f0d3bf93ebf716787425d5ae705ce8af` |
| Migrations | 60, sem duplicatas |
| Migration 61 | inexistente |
| `git diff --check` | sem erros; somente avisos de conversão LF/CRLF preexistentes |
| PROFILED | não ativado |
| Primeiro OWNER | fluxo não alterado; bootstrap não executado |
| Supabase/Render/Stripe/GitHub remoto | não acessados |
| Staging/commit/push/deploy | não executados |

## 10. Arquivos alterados na B2.19.1

| Arquivo | SHA-256 final |
|---|---|
| `backend/src/services/userService.js` | `f2f3f306be935e737000b67f8b3d2237f11d108753080f86341241a700f280be` |
| `backend/test/userService.test.js` | `bc42eeb3e6e42032426ca0ec51c8a2ecf50a97f2122b20299647354c57a0e428` |
| `src/pages/Users.test.js` | `5325466f7ac0af638ac3fe8d59ad9e1a3436fc10ccee080f7318b61b9953d648` |
| `package.json` | `fd59eea303cc6a25d7edff850f26cc020566c5b7f0f60f284bea64aa0a183a86` |
| `package-lock.json` | `dac4ef8dc73562cbe82f295c3b726681c38bba2d6bef4ed5d91623aa9f0fb96a` |

Este relatório é o sexto arquivo da allowlist. Nenhum arquivo de servidor foi alterado para o deep link porque o comportamento correto já existia.

## 11. Pendências remanescentes

- warning React de `Modal.maxWidth`;
- validação específica do fallback no futuro host de produção;
- FIDO2/UP/UV e migration 61 continuam em NO-GO;
- PROFILED continua deliberadamente desativado;
- rotação da credencial PostgreSQL anteriormente exposta permanece obrigatória antes de operação remota;
- B2.14 read-only e demais gates de publicação continuam pendentes.

## 12. GO/NO-GO

### GO

- validar manualmente a correção no ambiente local ativo;
- aceitar a reativação de inativos com isolamento preservado;
- aceitar a suíte frontend limpa 44/44 e backend 266/266;
- considerar encerrados os três bloqueios locais da B2.19.

### NO-GO

- staging, commit, push, merge, deploy ou publicação;
- ativar PROFILED;
- criar migration 61;
- implementar ou executar bootstrap do primeiro OWNER;
- conectar a serviços ou bancos remotos;
- considerar comprovado o fallback do futuro host sem validá-lo na infraestrutura de publicação.

B2.19.1 concluída no limite autorizado. Os serviços locais permanecem ativos para validação manual e nenhuma fase seguinte foi iniciada.
