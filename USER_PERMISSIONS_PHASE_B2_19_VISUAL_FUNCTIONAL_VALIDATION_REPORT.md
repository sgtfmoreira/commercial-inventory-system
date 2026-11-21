# BASTIDOR OS — B2.19: Validação visual e funcional integrada

> Data: 14 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> Base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **ambiente local navegável e isolado disponível; integração principal aprovada; publicação bloqueada por pendências de produto e reprodutibilidade frontend**

## 1. Resultado executivo

O módulo de usuários e permissões foi iniciado e exercitado com React, Node.js, Prisma 5.22 e PostgreSQL 16.14 reais, usando somente cópia temporária, banco descartável e dados fictícios.

Estado entregue para validação manual:

```text
frontend:   http://localhost:3000/
backend:    http://127.0.0.1:3333
PostgreSQL: 127.0.0.1:55440 / bastidor_b219
usuário:    owner.qa@bastidor.local
senha:      LocalVisual!219
```

As URLs foram consultadas novamente após a restauração da fixture: frontend HTTP 200, login backend HTTP 200, troca para `Bistrô Central QA` HTTP 200 e `GET /api/users` HTTP 200 com nove usuários visíveis.

Evidências principais:

- navegador Chromium real exibiu login, dashboard e `/users` em desktop e viewport móvel;
- chamadas do navegador a `/api/users`, `/api/user-access/profiles` e `/api/user-access/permissions` retornaram 200;
- 11/11 ensaios integrados HTTP + PostgreSQL foram aprovados;
- 46/46 testes backend relevantes foram aprovados;
- 60 migrations foram reproduzidas; migration 61 não existe e não foi criada;
- fixture-base foi restaurada após os ensaios;
- LEGACY permanece efetivo; flags PROFILED continuam desligadas e o kill switch ligado.

Decisão: **GO para validação manual local pelo responsável do produto. NO-GO para publicação ou encerramento de qualidade**, principalmente porque usuários totalmente inativos não são recuperáveis pela tela, deep links do frontend retornam 404 e a suíte frontend não é reproduzível pelo lockfile atual.

## 2. Gates e isolamento

| Gate | Resultado |
|---|---|
| Caminho informado sem `\.tools\` | Inexistente; usado o worktree real sob `commercial\.tools` |
| Branch/HEAD isolado | `integration/bastidor-permissions-b2` / `251d45bee486fc1af41e6ba2cff5ccc896dafc56` |
| Entradas preexistentes no worktree antes deste relatório | 91 |
| Staging isolado | Vazio |
| Working tree original | `feat/user-permissions-migration-plan` / `288de0c86262bb4a1602a418bf5b36060cbe3ddf` |
| Staging original | Vazio |
| Schema SHA-256 | `47b44778697099f55625d02c9b98dfb3f0d3bf93ebf716787425d5ae705ce8af` |
| Migrations no projeto | 60 |
| Schema/migrations/código funcional | Não alterados |
| Supabase/Render/Stripe/GitHub remoto | Não acessados |
| Commit/staging/push/deploy | Não executados |

A única alteração persistente da B2.19 é este relatório. Harnesses, dumps e capturas ficaram no diretório temporário e não alteraram o projeto.

## 3. Ambiente local disponível

### Serviços

| Componente | Endereço | Estado confirmado |
|---|---|---|
| Frontend React | `http://localhost:3000/` | HTTP 200 |
| Backend Express | `http://127.0.0.1:3333` | login e APIs autenticadas respondendo |
| PostgreSQL 16.14 | `127.0.0.1:55440` | ativo, somente local |
| Database | `bastidor_b219` | 60 migrations concluídas |
| Role | `bastidor_b219_admin` | descartável e local |

Diretório temporário:

```text
C:\Users\Moreira\AppData\Local\Temp\bastidor-b219-20261114
```

O frontend deve ser aberto por **`localhost`**, não por `127.0.0.1`. A política CORS existente aceita `http://localhost:3000`; usar `http://127.0.0.1:3000` produz bloqueio CORS.

### Contas fictícias

Todas usam a senha `LocalVisual!219`.

| Login | Cenário |
|---|---|
| `owner.qa@bastidor.local` | ADMIN em Central/Norte e OWNER explícito; conta principal de validação |
| `coowner.qa@bastidor.local` | segundo OWNER e ADMIN da Central |
| `manager.qa@bastidor.local` | duas unidades, papéis/perfis diferentes e DRAFT |
| `profiled.qa@bastidor.local` | linha sintética PROFILED para testar rollback; autorização efetiva global continua LEGACY |
| `vizinha.qa@bastidor.local` | organização vizinha para isolamento multi-tenant |
| `supervisor.qa@bastidor.local` | perfil de supervisão |
| `colaborador.qa@bastidor.local` | colaborador |
| `auditor.qa@bastidor.local` | auditor/consultor |
| `estoque.qa@bastidor.local` | `STOCK_COUNTER` |
| `multi.qa@bastidor.local` | vínculo adicional em unidade fora do alcance do ator |

O login OWNER oferece `Bistrô Central QA` e `Cozinha Norte QA`. A unidade `Unidade Restrita QA` existe para provar preservação de vínculo não administrável.

### Encerramento

Em PowerShell, encerrar somente os processos que escutam as portas descartáveis e depois o cluster:

```powershell
Get-NetTCPConnection -LocalPort 3000,3333 -State Listen |
  ForEach-Object { Stop-Process -Id $_.OwningProcess }

& 'C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe' `
  -D 'C:\Users\Moreira\AppData\Local\Temp\bastidor-b219-20261114\pgdata' `
  stop -m fast
```

Não apagar o diretório temporário enquanto a revisão manual estiver em andamento.

## 4. Fixtures e estado de autorização

A fixture-base possui:

- organização principal com três estabelecimentos;
- organização vizinha isolada;
- nove pessoas ativas na organização principal;
- um usuário totalmente inativo;
- dois OWNERs sintéticos na organização já inicializada;
- DRAFTs distintos por unidade;
- uma linha de acesso sintética em `PROFILED`, exclusivamente para rollback local.

Flags do processo backend:

```text
USER_PERMISSIONS_ENABLED=false
USER_PERMISSIONS_KILL_SWITCH=true
```

Consequentemente, o resolvedor efetivo permanece `LEGACY`. Nenhum endpoint de ativação foi chamado. A UI mantém `Ativar PROFILED` desabilitado.

## 5. Evidência visual

Capturas disponíveis no ambiente temporário:

```text
screenshots\01-login.png
screenshots\03-dashboard.png
screenshots\04-users-desktop.png
screenshots\05-users-mobile.png
```

Arquivos absolutos:

```text
C:\Users\Moreira\AppData\Local\Temp\bastidor-b219-20261114\screenshots
```

O navegador confirmou visualmente:

- identidade Bastidor OS e formulário de login;
- navegação preservada e item `Organização > Usuários`;
- contador `9 / 10`, duas unidades administráveis e modo efetivo `LEGACY`;
- cartões com nome, e-mail, ID, estado, unidades, papel LEGACY e DRAFT/ACTIVE;
- `STOCK_COUNTER = Contador de estoque` e `MANAGER = Gerente`;
- perfis diferentes em Central/Norte;
- ações editar, permissões e desativar;
- OWNER atual protegido contra autodesativação;
- layout adaptado a 390 px.

## 6. Ensaios integrados HTTP + PostgreSQL

O harness usou os controllers/services reais, chamadas HTTP autenticadas e leitura posterior pelo Prisma. Resultado: **11/11 aprovados**.

| Fluxo | HTTP | Persistência/evidência |
|---|---:|---|
| Login e escopo de unidade | 200/200 | token limitado à Central |
| Listagem | 200 | nove pessoas visíveis |
| Cadastro em duas unidades | 201 | duas memberships, MANAGER/STOCK_COUNTER, DRAFT MANAGER/AUDITOR |
| Override individual | 201 | `products.delete = DENY` persistido |
| Tentativa do 11º ativo | 409 | `A organização atingiu o limite de 10 usuários ativos.` |
| Edição | 200 | nome e papéis alterados no PostgreSQL |
| Tentativa cross-tenant | 403 | nenhuma pessoa criada |
| DRAFT/preview/histórico | 200/200/200 | versão otimista avançou e evento persistiu |
| OWNER normal | 200/201/200 | listagem, designação e revogação auditadas |
| Rollback da fixture PROFILED | 200 | modo retornou para LEGACY |
| Desativação | 204 | zero memberships ativas; total voltou a nove |

Ao fim, o dump-base foi restaurado. Assim, a conta temporária usada pelo harness não aparece no ambiente entregue, o usuário PROFILED voltou ao estado sintético inicial e os nove ativos estão novamente disponíveis para o teste manual do limite.

## 7. Matriz funcional

| Funcionalidade | Automático nesta etapa | Navegador real | Validação manual pendente | Estado |
|---|---|---|---|---|
| Listagem | API + DB | Renderizada | — | Aprovada |
| Busca/filtro | Testes anteriores; não reproduzidos pelo lockfile atual | Campo renderizado | Digitação/filtro final | Pendente parcial |
| Cadastro | API + DB | Botão/formulário disponível | Preencher e confirmar fluxo completo | Pendente parcial |
| Edição | API + DB | Ação disponível | Confirmar mensagens e remoções | Pendente parcial |
| Desativação | API + DB | Ação disponível | Confirmar modal e atualização visual | Pendente parcial |
| Reativação | Backend já possui contrato | Usuário totalmente inativo não aparece | Necessita correção de produto | **Bloqueada** |
| Limite de 10 | 409 e DB preservado | contador 9/10 | Criar o 10º e tentar o 11º | Aprovada tecnicamente |
| Perfis por unidade | API + DB | Visíveis em cartões | Salvar pelo formulário | Aprovada tecnicamente |
| Overrides ALLOW/DENY | API + DB | Tela de permissões disponível | Conferir clareza dos controles | Aprovada tecnicamente |
| Escopo por estabelecimento | API + DB + 403 cross-tenant | duas unidades visíveis | Alternar Central/Norte | Aprovada |
| DRAFT/preview | API + DB | DRAFT visível | Interação completa no modal | Aprovada tecnicamente |
| Histórico | API + DB | ação disponível | Revisão visual do conteúdo | Aprovada tecnicamente |
| Rollback | API + DB | fixture preparada | Confirmar texto e confirmação | Aprovada tecnicamente |
| OWNER normal | API + DB | botão disponível | Designar/revogar/transferir na fixture | Aprovada tecnicamente |
| Activate PROFILED | Não chamado | botão desabilitado | Não aplicável nesta fase | Bloqueado corretamente |

## 8. Testes automatizados

### Backend relevante

Executado de forma sequencial e com limite de memória após encerrar o navegador headless:

```text
arquivos: 6
testes:   46
passou:   46
falhou:    0
```

Incluiu usuários, controllers, OWNER, configuração de acesso, billing/estabelecimentos e paridade LEGACY.

### Frontend

A instalação limpa pelo lockfile iniciou e compilou o servidor de desenvolvimento, mas a suíte focada não pode carregar:

```text
Cannot find module '@testing-library/jest-dom' from 'src/setupTests.js'
```

`@testing-library/jest-dom` não consta de `package.json` nem de `package-lock.json`. Portanto, os 43/43 testes registrados nas fases anteriores dependiam de um conjunto de dependências compartilhado mais amplo e **não são reproduzíveis por `npm ci` neste checkout**. Nenhum pacote ou lockfile foi alterado sem autorização.

Isso é falha de preparação/testabilidade, não falha de uma asserção funcional da página.

## 9. Avaliação visual e de produto

### Pontos positivos

- hierarquia desktop clara: título, ações, métricas, filtros e cartões;
- design coerente com a identidade Bastidor e componentes existentes;
- chips distinguem estado, papel, modo e configuração;
- responsividade mantém todas as ações disponíveis em 390 px;
- textos deixam explícito que PROFILED ainda depende de ativação autorizada;
- contador usa corretamente a expressão `Ativos visíveis / limite`.

### Problemas encontrados

| Severidade | Problema | Impacto |
|---|---|---|
| **Alta** | Usuários sem nenhuma membership ativa não são retornados por `GET /api/users` | filtro “Inativos” não recupera quem precisa ser reativado; reativação fica indisponível na UI |
| **Alta** | `http://localhost:3000/users` retorna 404 quando aberto/recarregado diretamente | bookmarks e refresh em rota protegida quebram; exige entrar pela raiz |
| **Alta** | lockfile frontend não contém `@testing-library/jest-dom` | suíte frontend limpa não é reproduzível |
| Média | Cartão sintético mostra `PROFILED / ACTIVE` enquanto o resumo diz modo efetivo `LEGACY` | distinção entre modo persistido e modo efetivo pode confundir o administrador |
| Média | Página desktop e móvel cresce muito com nove usuários, sem paginação/compactação | administração perde eficiência ao atingir o limite e com múltiplas unidades |
| Média | Em mobile, e-mail/UUID e chips ficam pequenos e bastante fragmentados | leitura e comparação exigem rolagem intensa |
| Média | CORS aceita `localhost`, mas rejeita `127.0.0.1` para o frontend | URL local aparentemente equivalente falha com muitos 500 de preflight |
| Baixa | Ações desabilitadas do próprio OWNER não explicam o motivo no cartão | regra correta, mas descoberta ruim |
| Baixa | Contraste de alguns chips lilás/azul claro deve ser medido | acessibilidade de contraste não foi comprovada |

Teclado, leitor de tela, ordem de foco e contraste WCAG não foram auditados instrumentalmente nesta etapa.

## 10. Checklist manual do responsável pelo produto

1. Abrir **`http://localhost:3000/`**.
2. Entrar com `owner.qa@bastidor.local` / `LocalVisual!219`.
3. Selecionar `Bistrô Central QA`.
4. Abrir `Organização > Usuários`.
5. Buscar `Marina` e alternar os filtros de estado.
6. Confirmar contador 9/10 e duas unidades administráveis.
7. Criar o 10º usuário selecionando somente Central; conferir ausência de concessão automática.
8. Tentar cadastrar o 11º e conferir a mensagem de limite.
9. Editar um usuário multiunidade; atribuir perfis diferentes por unidade.
10. Conferir que `Unidade Restrita QA` não pode ser administrada pelo OWNER da fixture e que o vínculo não é removido.
11. Abrir `Permissões` de `manager.qa@bastidor.local`; revisar DRAFT, preview e histórico.
12. Abrir `profiled.qa@bastidor.local` e testar rollback para LEGACY; não usar Activate.
13. Abrir `Autoridades OWNER`; listar os dois OWNERs existentes e testar designação/revogação somente na fixture.
14. Alternar para `Cozinha Norte QA` e comparar os papéis/perfis.
15. Entrar com `vizinha.qa@bastidor.local` e confirmar ausência de dados da organização principal.
16. Repetir os passos essenciais em largura móvel pelo DevTools.
17. Não recarregar diretamente `/users` sem antes registrar o 404 conhecido; navegar pela raiz.

As ações são descartáveis, mas modificam a fixture local. Para repetir exatamente o baseline, restaurar `baseline.dump` com o backend parado ou recriar o ambiente.

## 11. Próximas correções recomendadas

1. **P0 — fluxo de inativos/reativação:** definir endpoint/listagem administrativa que inclua pessoas totalmente inativas da organização dentro do escopo autorizado, sem expor outro tenant.
2. **P0 — reprodutibilidade frontend:** adicionar `@testing-library/jest-dom` às dependências de desenvolvimento e lockfile em etapa autorizada; repetir 43 testes ou contagem maior.
3. **P1 — deep-link fallback:** configurar o servidor de desenvolvimento/hosting para devolver `index.html` em rotas React, preservando APIs.
4. **P1 — clareza do modo:** separar visualmente `modo persistido` de `modo efetivo (flags/kill switch)`.
5. **P1 — validação manual guiada:** executar o checklist com o responsável e registrar decisões/defeitos.
6. **P2 — densidade/responsividade:** oferecer resumo expansível ou paginação, mantendo unidades e perfis acessíveis.
7. **P2 — acessibilidade:** medir contraste, foco, nomes acessíveis e navegação por teclado.
8. **P2 — CORS local:** documentar `localhost` ou autorizar explicitamente a origem loopback necessária, sem ampliar produção.

Cada correção funcional exige nova allowlist. Nenhuma foi aplicada nesta fase de observação.

## 12. GO/NO-GO

### GO

- abrir e testar o sistema local agora em `http://localhost:3000/`;
- aceitar a evidência de integração HTTP/PostgreSQL dos fluxos principais;
- aceitar a qualidade visual como base utilizável para revisão de produto;
- usar somente as fixtures descartáveis e manter PROFILED globalmente desligado.

### NO-GO

- publicar ou encerrar a qualidade do módulo antes de resolver inativos/reativação, deep links e dependência de testes;
- afirmar que busca e todos os modais foram aprovados manualmente nesta etapa;
- ativar PROFILED pelo endpoint;
- executar primeiro OWNER real ou retomar a migration 61/FIDO2;
- conectar a banco ou serviço remoto;
- staging, commit, push ou deploy;
- alterar schema, migrations, lockfiles ou código funcional sem autorização.

B2.19 entrega um ambiente local navegável e evidência integrada real. A próxima ação recomendada é a validação manual do checklist, seguida de autorização separada para os três bloqueios de severidade alta.
