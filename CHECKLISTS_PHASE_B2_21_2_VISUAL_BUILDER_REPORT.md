# BASTIDOR OS — B2.21.2: Criador visual de modelos de checklists

> Data: 17 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> HEAD/base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **APIs e interface de modelos implementadas e validadas; laboratório PROFILED local navegável; execuções operacionais permanecem fora do escopo**

## 1. Resultado executivo

A B2.21.2 entregou o criador visual de modelos sobre a fundação da B2.21.1:

- listagem e criação de modelos em DRAFT;
- editor visual de seções e perguntas;
- quatro tipos de resposta: `BOOLEAN`, `CHOICE`, `NUMBER` e `TEXT`;
- ordenação determinística, regras de obrigatoriedade, criticidade, fotografia, `N/A` e pontos;
- prévia antes da publicação;
- salvamento integral do DRAFT com optimistic locking;
- publicação transacional e proteção do conteúdo publicado;
- histórico de versões, clonagem N+1 e retirada de circulação;
- navegação visível somente quando `checklists.templates.manage` é efetiva;
- autorização LEGACY e PROFILED pelo resolvedor B2 existente;
- isolamento por organização derivado exclusivamente da sessão autenticada.

Resultados finais:

```text
backend unitário/API novo:       12/12
backend HTTP + PostgreSQL:        1/1
PostgreSQL catálogo:              6/6
backend completo:              293/293 + 6 testes PG ignorados no passe geral
frontend focado:                 10/10
frontend completo:               50/50
build frontend:                  aprovado
migrations no laboratório:        61/61
```

Nenhum modelo de execução, atribuição, resposta, evidência, aprovação ou relatório foi implementado. Nenhuma migration nova foi criada: a migration 61 da B2.21.1 permanece a última e seu SHA-256 continua íntegro.

Decisão: **GO para validação manual local do criador visual. NO-GO para iniciar automaticamente a B2.21.3, distribuir checklists, publicar ou aplicar migrations fora do laboratório descartável.**

## 2. Allowlist e integridade

Arquivos funcionais alterados nesta etapa:

```text
backend/src/app.js
backend/src/routes/checklistTemplateRoutes.js
backend/src/controllers/checklistTemplateController.js
backend/src/services/checklistTemplateService.js
backend/src/repositories/checklistTemplateRepository.js
backend/src/validations/checklistTemplateApiValidation.js
backend/src/constants/legacyPermissionMap.js
backend/test/checklistTemplateApi.test.js
backend/test/checklistTemplateService.test.js
backend/test/checklistTemplateHttpPostgres.test.js
backend/test/legacyAuthorizationParity.test.js

src/App.js
src/components/SidebarLayout.js
src/components/SidebarLayout.test.js
src/context/AppContext.js
src/pages/ChecklistTemplates.js
src/pages/ChecklistTemplates.test.js
src/services/checklistTemplateService.js

CHECKLISTS_PHASE_B2_21_2_VISUAL_BUILDER_REPORT.md
```

Não foram modificados nesta etapa:

- schema Prisma ou migrations;
- `package.json` ou lockfiles;
- autenticação, JWT ou algoritmo do resolvedor B2;
- módulo do primeiro OWNER;
- ambiente original ou configurações de produção;
- worktree original.

O worktree isolado já continha mudanças acumuladas das fases B2 anteriores. Elas foram preservadas. O staging permanece vazio; não houve commit, push, merge ou deploy. `git diff --check` terminou sem erro, somente com avisos LF/CRLF preexistentes.

## 3. Contrato HTTP implementado

Todas as rotas usam `/api/checklists`, exigem autenticação e derivam usuário, membership, estabelecimento e organização de `req.user` e do banco.

| Método | Rota | Regra |
|---|---|---|
| GET | `/capabilities` | retorna somente o contexto mínimo do módulo |
| GET | `/templates` | lista modelos da organização autenticada |
| POST | `/templates` | cria identidade e primeira versão DRAFT |
| GET | `/templates/:templateId` | carrega modelo e histórico no tenant |
| PUT | `/templates/:templateId/draft` | substitui atomicamente o documento DRAFT |
| POST | `/templates/:templateId/publish` | valida e publica com optimistic locking |
| POST | `/templates/:templateId/versions` | clona uma versão publicada para N+1 DRAFT |
| POST | `/templates/:templateId/versions/:versionId/retire` | retira versão publicada de circulação |

As operações de catálogo exigem `checklists.templates.manage`. O fallback LEGACY permanece `ADMIN`; no modo PROFILED a decisão vem do perfil e dos overrides vigentes. O endpoint mínimo de capabilities não expõe catálogo completo nem amplia autoridade.

Não foram criadas rotas de execução, atribuição, evidência, aprovação ou relatórios.

## 4. Segurança e concorrência

Garantias comprovadas:

- `organizationId`, `establishmentId` e membership enviados pelo cliente não são aceitos como autoridade;
- contexto multi-tenant incompleto falha fechado;
- consulta cross-tenant responde como recurso inexistente;
- usuário sem identidade recebe 401;
- usuário autenticado sem capacidade recebe 403;
- DRAFT obsoleto recebe conflito por optimistic locking;
- publicação incompleta recebe 422;
- duas publicações concorrentes produzem exatamente uma aprovação e um conflito;
- versão publicada e seu conteúdo não podem ser reescritos;
- clonagem cria exatamente a próxima versão e preserva `sourceVersionId`;
- retirada de circulação preserva o histórico;
- PROFILED e LEGACY usam o mesmo resolvedor central, sem bypass visual.

O inventário de autorização foi atualizado para separar oito rotas diretas de checklists das 195 rotas LEGACY e das 12 rotas diretas de `user-access`. Nenhuma rota interna ficou sem política conhecida.

## 5. Interface entregue

Rotas React:

```text
/checklists/templates
/checklists/templates/:templateId
```

Funcionalidades disponíveis:

- entrada `Operação > Modelos de checklists` condicionada à capability efetiva;
- lista com estado vazio e ação de criação;
- formulário visual com nome, categoria, descrição e nota mínima;
- seções e perguntas adicionáveis, removíveis e reordenáveis;
- configuração específica para cada tipo de resposta;
- flags de obrigatoriedade, criticidade, fotografia e `N/A`;
- prévia legível antes da publicação;
- feedback de sucesso e erros do backend;
- visualização somente leitura de versões publicadas e retiradas;
- histórico lateral e clonagem para uma nova versão editável.

O frontend usa a capability apenas para experiência e navegação. O backend continua sendo a autoridade final.

## 6. Testes automatizados

### Backend unitário/API — 12/12

Cobertura principal:

- payload não controla tenant ou ator;
- quatro tipos de resposta e posições determinísticas;
- contexto derivado da sessão e falha fechada;
- superfície exata das rotas autorizadas;
- fallback LEGACY e capability mínima;
- escopo de listagem e consulta cross-tenant;
- optimistic locking;
- validação de publicação;
- concorrência de publicação;
- clonagem N+1.

### Backend completo — 293 aprovados

```text
total:     299
aprovados: 293
falhas:      0
ignorados:   6 (testes PostgreSQL executados separadamente)
```

### PostgreSQL — 6/6 + 1/1 HTTP integrado

Os seis testes estruturais da B2.21.1 continuaram aprovados. O ensaio HTTP real adicional comprovou em um PostgreSQL descartável:

- 401 e 403;
- autorização LEGACY e PROFILED;
- ADMINISTRATOR autorizado e SUPERVISOR negado;
- criação e isolamento entre tenants;
- publicação incompleta;
- salvamento válido;
- publicação concorrente com um 200 e um 409;
- imutabilidade;
- clonagem N+1;
- retirada de circulação e persistência real.

### Frontend — 50/50

```text
suítes: 10/10
testes: 50/50
falhas: 0
```

Os dez testes focados cobrem o criador visual, a navegação capability-aware e a remoção de metadados internos do payload após clonagem ou recarregamento. Permanece o warning preexistente de `Modal.maxWidth`, sem falha funcional.

### Build

Uma instalação limpa em harness temporário compilou o frontend. A primeira tentativa encerrou por heap V8; a repetição com `NODE_OPTIONS=--max-old-space-size=4096`, apenas no processo temporário, concluiu normalmente. Nenhum arquivo de configuração foi alterado.

O bundle principal ficou em aproximadamente 535,58 kB gzip e permanece como ponto de otimização, não como bloqueio funcional desta entrega.

## 7. Evidência de navegador

A automação de interface integrada do ambiente não respondeu dentro do timeout em duas tentativas. Conforme o procedimento da ferramenta, ela foi interrompida e a validação continuou com o Chrome já instalado, em perfil descartável e controlado pelo protocolo local de depuração. Nenhum navegador, pacote ou driver foi baixado.

Fluxo realizado no navegador real:

1. login com ADMINISTRATOR fictício;
2. seleção de `Central PROFILED`;
3. confirmação de que todos os recursos da aplicação apontavam para o backend 3335;
4. abertura de `Modelos de checklists`;
5. criação de `Abertura segura da cozinha`;
6. edição de uma seção e uma pergunta BOOLEAN obrigatória, crítica e com foto;
7. prévia visual;
8. publicação da versão 1;
9. confirmação da tela somente leitura e do histórico;
10. validação em viewport móvel 390 × 844, sem overflow horizontal;
11. clonagem para versão 2 DRAFT.

Durante a validação manual posterior foi identificado que um DRAFT recarregado ou clonado mantinha no estado React metadados persistidos (`id`, `templateVersionId`, `sectionId`, `createdAt` e `updatedAt`). O serializador usava spread e os reenviava; a validação estrita respondia HTTP 422. A correção passou a montar explicitamente o contrato de seção e item, sem relaxar a API. O salvamento da versão 2 foi então repetido no navegador e retornou `Rascunho salvo.`, com persistência PostgreSQL confirmada.

As capturas desktop, prévia, versão publicada, mobile e versão 2 foram renderizadas durante a validação e não foram adicionadas ao repositório.

Persistência final observada:

| Modelo | Versão | Estado | Seções | Itens |
|---|---:|---|---:|---:|
| Abertura segura da cozinha | 1 | PUBLISHED | 1 | 1 |
| Abertura segura da cozinha | 2 | DRAFT | 1 | 1 |

## 8. Migrations e banco

Laboratório atual:

```text
PostgreSQL: 127.0.0.1:55442
banco:      bastidor_b2212_templates
migrations: 61 finalizadas
última:     20261117200927_add_checklist_template_catalog
```

SHA-256 confirmado da migration 61:

```text
3af21f2778ab97640e9367c4b26382121560b4a11a0afee25d2e3d163ef4e096
```

O `Prisma Migrate` foi executado no banco novo e reportou 61/61 migrations aplicadas e estado limpo. Nenhuma migration 62 foi criada.

## 9. Laboratório disponível para validação manual

```text
frontend:   http://localhost:3002/checklists/templates
backend:    http://127.0.0.1:3335
PostgreSQL: 127.0.0.1:55442/bastidor_b2212_templates
modo:       PROFILED exclusivamente neste processo local
```

Credencial fictícia recomendada:

```text
e-mail: administrator.profiled@bastidor.local
senha:  ProfiledLocal!2201
```

Outros usuários fictícios usam a mesma senha, mas não devem receber acesso ao criador se a capability efetiva estiver ausente.

Processos confirmados na conclusão:

```text
frontend Node: PID 3016
backend Node:  PID 22456
PostgreSQL:    PID 8716 (processo principal observado)
Chrome QA:     PID 11784
```

O ambiente utiliza somente banco, portas, segredo JWT e perfil do navegador locais e descartáveis. Nenhuma URL ou credencial remota foi usada.

## 10. Checklist manual

1. abrir `http://localhost:3002/checklists/templates`;
2. autenticar com o ADMINISTRATOR fictício;
3. selecionar `Central PROFILED`;
4. confirmar a entrada `Operação > Modelos de checklists`;
5. abrir `Abertura segura da cozinha`;
6. confirmar a versão 1 como `Publicada` e somente leitura;
7. confirmar a versão 2 como `Rascunho` e editável;
8. alterar a versão 2, salvar e recarregar a página;
9. usar `Prévia` e conferir pergunta, pontos e flags;
10. testar largura móvel e confirmar ausência de rolagem horizontal;
11. opcionalmente publicar a versão 2 e confirmar que a versão 1 não muda;
12. autenticar com um perfil sem `checklists.templates.manage` e confirmar ausência do menu e 403 direto na API.

## 11. Problemas e riscos remanescentes

| Severidade | Item | Tratamento recomendado |
|---|---|---|
| Média | bundle principal acima da recomendação do build | code splitting em fase própria |
| Média | frontend global ainda possui áreas orientadas por papel LEGACY | continuar migração capability-aware por módulo |
| Baixa | warning preexistente `Modal.maxWidth` | corrigir no design system em allowlist própria |
| Baixa | helper de automação visual expirou no ambiente | investigar separadamente; Chrome local validou o fluxo |
| Produto | AUDITOR continua sem leitura de checklists | decisão específica antes dos relatórios |

Execuções, responsáveis, fotos, pontuação persistida, aprovação e relatórios permanecem deliberadamente ausentes e não são defeitos desta entrega.

## 12. GO/NO-GO

### GO

- validar manualmente o criador visual no laboratório ativo;
- aceitar as APIs de templates e o isolamento multi-tenant;
- aceitar publicação imutável, histórico e clonagem N+1;
- preparar uma autorização separada para a próxima entrega do PRD.

### NO-GO

- iniciar automaticamente a B2.21.3;
- implementar execução, atribuição, evidência, aprovação ou relatório;
- aplicar a migration 61 em ambiente compartilhado ou remoto;
- ativar PROFILED fora do laboratório local;
- modificar o primeiro OWNER;
- staging, commit, push, merge, deploy ou acesso a serviços remotos.

B2.21.2 concluída dentro da allowlist. O laboratório permanece ativo para validação manual e nenhuma fase seguinte foi iniciada.
