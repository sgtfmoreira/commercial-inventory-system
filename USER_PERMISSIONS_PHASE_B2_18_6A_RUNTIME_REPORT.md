# BASTIDOR OS — B2.18.6A: Correção de runtime, dependências e validação reproduzível

> Data: 12 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> Base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **validação reproduzível concluída; 257/257 testes backend e 34/34 frontend aprovados**

## 1. Resultado executivo

A B2.18.6A foi retomada com acesso controlado exclusivamente ao registry oficial do npm. As instalações limpas de backend e frontend foram executadas em diretórios temporários separados, usando `npm ci`, os lockfiles existentes e `--ignore-scripts`.

Resultados:

- backend: 171 pacotes instalados; Zod `3.25.76`, Prisma/Client `5.22.0` e Stripe `23.0.1`;
- frontend: 1.411 pacotes instalados a partir do lockfile;
- Prisma Client gerado novamente e confirmado com os campos reconciliados de reservas;
- build seguro executado com sucesso e limitado a `prisma generate`;
- suíte backend: **257 aprovados, zero falhas**;
- suíte frontend: **34 aprovados, zero falhas**;
- schema e 60 migrations preservados;
- LEGACY preservado e PROFILED desativado;
- diretórios temporários removidos;
- nenhum banco, Supabase, Render ou Stripe foi acessado.

As duas falhas observadas na B2.18.5 foram eliminadas sem alterar regras de produção: o mock de autenticação acompanha `findFirst`, e o teste de preço de venda passa com o Zod 3 definido no lockfile.

Decisão: **GO para iniciar a B2.18.6B após revisão e autorização específica. NO-GO permanece para staging, commit, deploy, banco remoto ou ativação PROFILED.**

## 2. Gates e isolamento

| Gate | Resultado |
|---|---|
| Worktree/branch/HEAD | Confirmados |
| HEAD | `251d45bee486fc1af41e6ba2cff5ccc896dafc56` |
| Staging | Vazio |
| Schema SHA-256 | `47b44778697099f55625d02c9b98dfb3f0d3bf93ebf716787425d5ae705ce8af` |
| Migrations | 60, zero nomes duplicados |
| Segredos de banco/Stripe no processo | Ausentes |
| Registry | `https://registry.npmjs.org/` |
| URLs resolvidas fora do registry oficial | Zero nos lockfiles |
| Modo de autorização | LEGACY |
| PROFILED | Desativado por flag e kill switch nos testes |
| Working tree original | Branch/HEAD e 243 entradas preexistentes preservados; zero staged |

Identidade final do working tree original:

```text
branch: feat/user-permissions-migration-plan
HEAD:   288de0c86262bb4a1602a418bf5b36060cbe3ddf
staged: 0
```

## 3. Arquivos modificados

### `backend/package.json`

```text
engines.node: >=18.0.0 -> >=20.0.0
build: npx prisma generate && npx prisma migrate deploy && npx prisma db seed
    -> prisma generate
start: prisma migrate deploy && node src/server.js
    -> node src/server.js (reconciliação cumulativa preservada)
```

O build e o start não contêm migration ou seed. Os scripts administrativos explícitos permanecem disponíveis apenas para uso manual autorizado e não foram movidos para lifecycle.

### `backend/package-lock.json`

- engine raiz sincronizado em `>=20.0.0`;
- Stripe `23.0.1` preservado com integrity e URL oficial;
- nenhuma versão foi atualizada pela retomada da B2.18.6A.

### `backend/test/authMiddlewareActiveMembership.test.js`

O double passou a implementar a operação realmente usada pelo middleware:

```text
userEstablishment.findFirst -> null
```

Isso representa uma associação revogada perante a consulta `isActive: true`. Nenhum arquivo de produção foi modificado para satisfazer o teste.

## 4. Instalação limpa

Foram criadas cópias temporárias separadas de backend e frontend, sem `.env`, credenciais ou `node_modules` dos working trees. Os comandos executados foram:

```text
npm ci --ignore-scripts --registry=https://registry.npmjs.org/ --no-audit --no-fund
```

| Ambiente | Resultado | Pacotes |
|---|---|---:|
| Backend | Aprovado | 171 |
| Frontend | Aprovado | 1.411 |

Garantias:

- o npm respeitou exclusivamente os lockfiles;
- lifecycle scripts permaneceram desativados durante a instalação;
- não foi usado `--offline`;
- não houve alteração nos `node_modules` dos working trees;
- os avisos do frontend foram somente de pacotes legados/depreciados já fixados no lockfile;
- os dois diretórios temporários foram removidos ao final.

## 5. Versões efetivas

| Componente | Versão efetiva limpa |
|---|---|
| Node.js | `24.19.0` |
| npm | `11.17.0` |
| requisito mínimo do backend | `>=20.0.0` |
| Prisma CLI | `5.22.0` |
| Prisma Client | `5.22.0` |
| Zod | `3.25.76` |
| Stripe | `23.0.1` |

`npm ls --depth=0` confirmou a árvore direta do backend sem dependência inválida ou ausente.

## 6. Prisma Client e build

Como a instalação foi deliberadamente feita com `--ignore-scripts`, os engines Prisma não foram preparados pelo postinstall. A primeira tentativa de geração não conectou a banco, mas tentou obter o checksum/engine em `binaries.prisma.sh`. Esse host não fazia parte da autorização do registry npm, portanto não foi liberado.

Para manter a restrição de rede, foram usados somente os engines Prisma `5.22.0` já disponíveis localmente, copiados para o ambiente temporário após comparação de versão e SHA-256:

| Engine | SHA-256 |
|---|---|
| `query_engine-windows.dll.node` | `7d58cada77c5833e57d2ab4ad61ea2948247b2caa8575066b2fe3bc7e4ea4e5a` |
| `schema-engine-windows.exe` | `a7d949e16cc5937aa77d67888c8993118ef16c764e536e9ed7c17cfe61bb65ad` |

O datasource do processo apontou para PostgreSQL inválido em `127.0.0.1:1`. Com os caminhos dos engines definidos explicitamente:

```text
prisma generate: aprovado
Prisma Client:   5.22.0
conexão a banco: nenhuma
```

O DMMF do client recém-gerado confirmou em `TableReservation`:

```text
reservationGroupId
checkedInAt
checkedInByUserId
```

O script corrigido também foi exercitado:

```text
npm run build
-> prisma generate
-> exit code 0
```

Nenhuma migration, seed, SQL ou script de reparação foi chamado pelo build.

## 7. Testes backend

Foram executados os 59 arquivos `backend/test/*.test.js` com:

- `DATABASE_URL` em loopback inválido;
- `USER_PERMISSIONS_ENABLED=false`;
- `USER_PERMISSIONS_KILL_SWITCH=true`;
- segredo JWT exclusivamente local e descartável;
- variáveis Stripe e PostgreSQL externas removidas;
- Prisma Client recém-gerado;
- Zod 3.25.76 do lockfile.

Resultado final:

```text
arquivos:    59
testes:      257
aprovados:   257
falhas:      0
cancelados:  0
ignorados:   0
```

A primeira execução temporária encontrou apenas ausência do arquivo local `scripts/repair-park-stock-locations.js` na cópia de teste. O script autorizado foi então copiado byte a byte, com SHA-256 `24907a0a379c50dc56dbdcf2d8a4d9ee5ee115fde7d4cd914d226c4e1e75c80f`, e somente seus testes puros importaram `buildPlan`. O script operacional não foi executado.

Confirmações relevantes:

- `authMiddlewareActiveMembership.test.js` passou com o mock corrigido;
- `productSalePriceValidation.test.js` passou sem modificação, usando Zod 3;
- autorização LEGACY, B2 opt-in, billing mockado, estoque, transferências, reservas e multi-tenant permaneceram aprovados.

## 8. Testes frontend

O frontend foi testado com sua própria instalação limpa, sem `REACT_APP_API_URL` e sem credenciais externas.

```text
suítes:      8/8 aprovadas
testes:      34/34 aprovados
snapshots:   0
falhas:      0
```

Foram aprovados App, Sidebar, eventos, estoque, reservas, contexto de loading, tema e utilitários de porcionamento.

## 9. Integridade final

| Verificação | Resultado |
|---|---|
| Schema SHA-256 | `47b44778697099f55625d02c9b98dfb3f0d3bf93ebf716787425d5ae705ce8af` |
| Migrations | 60, inalteradas e sem duplicatas |
| `git diff --check` | Aprovado |
| Staging no worktree isolado | Vazio |
| Working tree original | Preservado; 243 entradas preexistentes e zero staged |
| Diretórios temporários | Removidos |
| LEGACY | Preservado como padrão |
| PROFILED | Não ativado |
| Supabase/Render/Stripe | Nenhuma conexão |
| Migration/seed/replay/reparação | Não executados |
| Commit/push/deploy | Não executados |

## 10. Pendências após a B2.18.6A

Os bloqueios de runtime e dependências da B2.18.5 foram resolvidos. Permanecem fora desta subetapa:

- interface B2 de usuários;
- bootstrap operacional e auditado do primeiro OWNER;
- definição do limite de usuários;
- decisão sobre CONSULTOR versus AUDITOR;
- testes de interação de `Users.js`;
- B2.14 read-only e rotação da credencial PostgreSQL exposta;
- oito divergências decimais e o default de billing;
- qualquer ativação PROFILED, publicação ou operação remota.

O uso de engines locais exatos resolveu a geração sem ampliar a rede. Antes de um pipeline totalmente novo, o processo de distribuição dos engines Prisma deve continuar permitido pelo fluxo normal de instalação ou disponibilizado por cache interno confiável.

## 11. GO/NO-GO

### GO para B2.18.6B

- instalação limpa reproduzível aprovada com versões do lockfile;
- Node mínimo alinhado ao Stripe 23;
- build e start sem alteração automática de banco;
- Prisma Client atualizado e validado;
- 257/257 testes backend e 34/34 frontend aprovados;
- schema, migrations, LEGACY e isolamento preservados.

### NO-GO mantido

- iniciar B2.18.6B sem nova autorização e allowlist explícita;
- staging, commit, push ou deploy;
- ativar PROFILED;
- conectar a Supabase, Render ou Stripe;
- usar a credencial PostgreSQL exposta;
- executar migration, seed, replay ou script de reparação;
- corrigir precisões/defaults por inferência.

B2.18.6A concluída e aprovada no escopo local. Aguardando revisão antes da B2.18.6B.
