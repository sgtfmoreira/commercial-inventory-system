# BASTIDOR OS — B2.20: Validação funcional integrada dos seis perfis

> Data: 15 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> HEAD/base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **auditoria contratual concluída; execução PROFILED real bloqueada por flags globais e aguardando autorização complementar**

## 1. Resultado executivo

A auditoria confirmou que o backend possui uma matriz V1 com 113 capacidades, seis perfis imutáveis, overrides `ALLOW`/`DENY`, isolamento por vínculo e tenant, prevenção de autoelevação e autoridade OWNER organizacional separada do perfil da unidade.

Também confirmou que a validação real solicitada não pode ser executada com segurança no ambiente navegável atual sem mudar a configuração global do processo:

```text
USER_PERMISSIONS_ENABLED=false
USER_PERMISSIONS_KILL_SWITCH=true
```

Não existe feature flag por organização. Mesmo que uma fixture esteja persistida como `PROFILED`, o resolvedor continua aplicando as regras LEGACY quando a feature está desligada ou o kill switch está ativo. A execução efetiva exige iniciar outro backend com:

```text
USER_PERMISSIONS_ENABLED=true
USER_PERMISSIONS_KILL_SWITCH=false
```

Como a B2.20 determina interromper antes de mudança global ou remoção do kill switch, nenhuma ativação, reinicialização ou mutação foi feita. A recomendação é executar a matriz em um segundo PostgreSQL descartável, segundo backend e segundo frontend, em portas exclusivas, preservando integralmente a demonstração B2.19.1.

Decisão: **GO para o desenho e para os contratos existentes. NO-GO para declarar os seis perfis validados ponta a ponta até autorizar explicitamente o ambiente paralelo PROFILED.**

## 2. Escopo e integridade

Allowlist persistente anunciada e respeitada:

```text
USER_PERMISSIONS_PHASE_B2_20_PROFILE_VALIDATION_REPORT.md
```

Nenhum código funcional, teste, fixture do worktree, schema, migration ou lockfile foi modificado. Não houve staging, commit, push, deploy, acesso remoto, criação de OWNER, migration 61 ou alteração do worktree original.

As verificações executadas foram somente:

- leitura de código e contratos;
- testes existentes com doubles e PostgreSQL local apenas como datasource de inicialização;
- consultas PostgreSQL com `default_transaction_read_only=on`;
- verificações HTTP sem mutação.

## 3. Matriz real dos perfis V1

| Perfil | Nível | Capacidades | Financeiras | Sensíveis | Característica efetiva |
|---|---:|---:|---:|---:|---|
| OWNER | 600 | 113 | 27 | 17 | Catálogo completo, mas quatro capacidades estruturais ainda exigem OWNER organizacional explícito |
| ADMINISTRATOR | 500 | 109 | 26 | 13 | Quase completo; não possui gestão de OWNER/política, atualização organizacional nem `billing.manage` |
| MANAGER | 400 | 75 | 20 | 0 | Operação ampla sem exclusão, segurança, usuários, organização, billing ou módulos organizacionais estruturais |
| SUPERVISOR | 300 | 28 | 0 | 0 | Leitura operacional e execuções delimitadas, sem finanças e sem capacidades sensíveis |
| COLLABORATOR | 200 | 14 | 0 | 0 | Leitura operacional básica e poucas execuções de rotina |
| AUDITOR | 100 | 23 | 0 | 0 | Somente leitura, sem capacidades financeiras ou sensíveis |

As quatro capacidades que exigem autoridade organizacional ativa além do perfil são:

```text
security.owner.manage
security.policy.manage
organization.update
billing.manage
```

Assim, o perfil `OWNER` de um estabelecimento não equivale, sozinho, a uma `OrganizationAuthority(OWNER)`.

### 3.1 Cobertura funcional resumida

| Área | OWNER | ADMINISTRATOR | MANAGER | SUPERVISOR | COLLABORATOR | AUDITOR |
|---|---|---|---|---|---|---|
| Usuários/permissões | total + autoridade quando exigida | criar/ler/editar/gerenciar | não | não | não | somente leitura |
| Organização/estabelecimentos | total + autoridade | leitura e estabelecimentos | não | não | não | leitura |
| Billing | ler/gerenciar + autoridade | somente leitura | não | não | não | não |
| Produtos/receitas | total | total | criar/ler/editar/gerenciar sem delete | leitura | leitura | leitura |
| Estoque/produção | total | total | operação ampla sem delete/approve sensível | leitura e execuções delimitadas | leitura básica | leitura |
| Eventos/mesas | total | total | criar/ler/editar e operar | leitura/operação delimitada | leitura | leitura |
| Relatórios financeiros | sim | sim conforme capacidades | sim conforme capacidades | não | não | não por padrão |

A lista exata e versionada permanece em `backend/src/constants/permissions.js` e `backend/src/constants/accessProfiles.js`; a tabela acima é uma síntese, não uma segunda fonte normativa.

## 4. Resolução de permissões

Ordem efetiva do resolvedor:

1. rejeitar vínculo ou estabelecimento inativo;
2. se feature desligada ou kill switch ativo, decidir por LEGACY;
3. se não houver acesso PROFILED ativo, preservar fallback LEGACY;
4. em PROFILED, carregar configuração `ACTIVE` e falhar fechado se ela estiver ausente;
5. aplicar permissões-base do perfil;
6. aplicar `DENY` com precedência;
7. aplicar `ALLOW` somente se não houver `DENY` e a capacidade for delegável;
8. para capacidades estruturais, exigir também autoridade OWNER organizacional ativa.

Garantias confirmadas:

- `DENY` vence `ALLOW` para a mesma capacidade;
- override `ALLOW` não concede capacidade indelegável;
- concessões financeiras ou sensíveis exigem justificativa;
- o ator não pode alterar o próprio acesso;
- o ator não pode conceder perfil ou capacidade acima do que possui;
- somente OWNER organizacional altera outro OWNER ou designa perfil OWNER;
- DRAFT não muda autorização efetiva;
- ativação e rollback são versionados, serializáveis e auditados.

## 5. Endpoints protegidos e exceções

O inventário existente encontrou:

```text
rotas Express LEGACY inventariadas: 195
rotas internas LEGACY reconciliadas com capacidades B2: 185
rotas B2 de user-access protegidas diretamente por capability: 12
```

As 185 rotas internas passam pelo `authMiddleware`, que resolve método e caminho para uma capacidade quando a feature global está ativa. O `requireRole` mantém a decisão histórica em LEGACY e cede à decisão central quando o modo efetivo é PROFILED.

As rotas `/api/user-access` usam `requireCapability` diretamente para catálogo, acesso, DRAFT, preview, ativação, rollback, histórico e administração normal de OWNER.

Ficam fora do modelo PROFILED interno:

- registro e login públicos;
- webhook Stripe;
- autenticação e tráfego próprios do portal do fornecedor;
- rotas públicas explicitamente inventariadas.

Não foi encontrada rota interna conhecida sem política no snapshot atual. Isso é evidência estrutural; a matriz HTTP por perfil ainda precisa ser executada com enforcement PROFILED real.

## 6. Isolamento e elevação de privilégios

O backend deriva o estabelecimento exclusivamente do JWT assinado e recarrega o vínculo ativo no banco. `establishmentId` fornecido por body ou header não substitui o tenant do token.

Os repositórios de acesso exigem simultaneamente:

- membership ativo;
- estabelecimento ativo;
- estabelecimento e organização do contexto autenticado;
- usuário-alvo dentro da unidade escopada.

Os testes existentes confirmaram:

- bloqueio de autoelevação;
- bloqueio de alvo cross-tenant;
- bloqueio de concessão acima do ator;
- proteção de autorrevogação e do último OWNER;
- transferência OWNER atômica e auditada;
- ausência de bootstrap implícito do primeiro OWNER.

## 7. Divergências frontend/backend

### Alta — frontend ainda é orientado por papel LEGACY

O backend está preparado para capability enforcement, mas a navegação React não recebe nem resolve o conjunto efetivo de capacidades do usuário.

- `SidebarLayout` usa principalmente presença de estabelecimento e papel LEGACY;
- somente a página `/users` possui restrição explícita `roles: ['ADMIN']` na navegação;
- as rotas React usam proteção genérica de autenticação, não guards por capability;
- ações em produtos e fornecedores organizacionais ainda consultam `state.user.role === 'ADMIN'`;
- a página de usuários define unidades administráveis pelo papel LEGACY `ADMIN`.

Consequências quando PROFILED for efetivamente ativado:

1. a interface pode exibir página ou botão que o backend rejeitará com 403;
2. a interface pode ocultar ação concedida pelo perfil ou por override;
3. um usuário com perfil `ADMINISTRATOR` mas papel LEGACY diferente de `ADMIN` pode não acessar a administração visual esperada;
4. estados de acesso negado serão reativos, após a chamada HTTP, em vez de preventivos e explicativos.

### Média — ativação existe na API, mas está bloqueada na UI

A API possui ativação confirmada e auditada. A interface desabilita deliberadamente o botão `Ativar PROFILED`. Isso evita ativação acidental, mas impede montar os seis cenários pela UI.

### Média — perfil e autoridade OWNER têm nomes próximos

A interface deve deixar explícito que perfil `OWNER` da unidade não substitui a autoridade organizacional OWNER. Hoje essa distinção depende principalmente de textos e da seção separada de autoridades.

## 8. Evidências executadas nesta etapa

### Testes específicos existentes

```text
arquivos: permissionContracts, permissionResolver,
          legacyAuthorizationParity, organizationAuthority,
          userAccessConfiguration
testes:   27/27 aprovados
falhas:   0
```

Eles cobriram catálogo, seis perfis, 185 rotas internas, paridade LEGACY, flags, kill switch, PROFILED fail-closed, overrides, delegação, isolamento, optimistic locking, ativação/rollback e OWNER.

### PostgreSQL local em modo somente leitura

```text
servidor:   127.0.0.1:55440
banco:      bastidor_b219
migrations: 60
acessos:    2 LEGACY, 1 PROFILED
configs:    2 DRAFT, 1 ACTIVE
```

A fixture persistida `profiled.qa@bastidor.local` possui perfil ativo `COLLABORATOR`, mas o backend atual a autoriza por LEGACY por causa das flags globais. Ela não conta como prova PROFILED ponta a ponta.

## 9. Ambiente navegável preservado

```text
frontend: http://localhost:3000/
users:    http://localhost:3000/users
backend:  http://127.0.0.1:3333
banco:    127.0.0.1:55440 / bastidor_b219
```

Credenciais fictícias:

```text
owner.qa@bastidor.local    / LocalVisual!219
profiled.qa@bastidor.local / LocalVisual!219
```

O primeiro usuário permite revisar a administração LEGACY já aprovada. O segundo **não** demonstra enforcement PROFILED enquanto o processo atual mantiver a feature desligada/kill switch ativo.

## 10. Proposta para a execução real B2.20

Para não mudar o ambiente aprovado da B2.19.1, propõe-se:

1. restaurar o baseline sintético em novo banco `bastidor_b220_profiled`;
2. usar somente as 60 migrations existentes;
3. criar fixtures locais para os seis perfis e uma organização vizinha;
4. iniciar segundo backend em `127.0.0.1:3334` com datasource exclusivo;
5. nesse segundo processo apenas, definir `USER_PERMISSIONS_ENABLED=true` e `USER_PERMISSIONS_KILL_SWITCH=false`;
6. iniciar segundo frontend em `localhost:3001`, apontado exclusivamente ao backend 3334;
7. inserir autoridades OWNER apenas como fixtures sintéticas descartáveis;
8. executar a matriz HTTP/PG por perfil, unidade, tenant, ALLOW/DENY e finanças;
9. validar desktop e mobile no navegador;
10. encerrar e remover todo o ambiente B2.20, preservando o B2.19.1.

Nenhuma alteração de código é necessária para montar o laboratório. A ativação de configurações pode ser feita exclusivamente nas fixtures do novo banco. O risco operacional é controlado pela separação de banco e portas, mas a mudança das flags ainda requer autorização explícita conforme a própria B2.20.

### Matriz mínima de execução proposta

Para cada perfil:

- login e troca de estabelecimento;
- uma leitura permitida e uma operação permitida;
- uma operação proibida chamada diretamente por HTTP;
- uma tentativa em outra unidade;
- uma tentativa em outra organização;
- verificação da persistência ou ausência de mutação no PostgreSQL;
- captura desktop e mobile;
- comparação entre botão/menu e resultado HTTP.

Casos transversais:

- `DENY` removendo capacidade-base;
- `ALLOW` delegável adicionando capacidade específica;
- rejeição de `ALLOW` indelegável;
- finanças para OWNER/ADMINISTRATOR/MANAGER e negação aos demais;
- autoelevação;
- último OWNER;
- modo PROFILED sem ACTIVE falhando fechado;
- kill switch retornando imediatamente a LEGACY em teste de rollback operacional.

## 11. Bloqueios e riscos

| Severidade | Item | Consequência |
|---|---|---|
| Crítica | Flags são globais ao processo | Não é possível ativar somente uma organização no backend atual |
| Alta | Frontend não é capability-aware | Visibilidade pode divergir da autorização real e gerar falsos positivos/negativos visuais |
| Alta | UI não ativa PROFILED | Fixtures ou chamada administrativa local controlada são necessárias para os seis cenários |
| Alta | Matriz HTTP/PG ainda não executada em enforcement real | Os seis perfis não podem ser declarados validados ponta a ponta |
| Média | OWNER perfil versus autoridade OWNER | Risco de interpretação incorreta pelo operador |
| Média | AUDITOR possui `users.read`, mas não troca de unidade | Escopo real depende do estabelecimento já selecionado no token |

## 12. GO/NO-GO

### GO

- aceitar a auditoria da matriz e a cobertura estrutural das rotas;
- aceitar os 27/27 testes específicos existentes;
- aprovar a montagem do ambiente paralelo proposto;
- manter o ambiente B2.19.1 acessível e inalterado.

### NO-GO atual

- declarar os seis perfis validados funcional e visualmente;
- alterar as flags do backend atual;
- desativar o kill switch no ambiente navegável existente;
- modificar frontend/backend sem nova allowlist;
- ativar PROFILED fora do novo banco fictício descartável;
- staging, commit, push, merge, deploy ou acesso remoto;
- migration 61 ou cerimônia do primeiro OWNER.

## 13. Autorização complementar necessária

Para continuar a B2.20, é necessária autorização explícita para:

```text
- criar um segundo PostgreSQL local descartável;
- iniciar um segundo backend local em porta separada com
  USER_PERMISSIONS_ENABLED=true e USER_PERMISSIONS_KILL_SWITCH=false;
- iniciar um segundo frontend local em porta separada;
- criar e ativar somente fixtures sintéticas dos seis perfis nesse banco;
- executar testes HTTP/PG e navegador sem alterar código funcional.
```

Até essa autorização, a B2.20 permanece encerrada no gate de inspeção, sem mudança de autorização efetiva.
