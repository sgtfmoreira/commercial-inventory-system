# BASTIDOR OS — B2.21.4: execução, respostas e evidências de checklists

> Data de conclusão: 20 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> HEAD/base preservado: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **Entrega 4 implementada e validada localmente; nenhum storage remoto, commit, push, merge, deploy ou acesso à produção executado**

## 1. Resultado executivo

A Entrega 4 concluiu o fluxo operacional do executor até a submissão:

- fila pessoal limitada ao membership atualmente responsável;
- início idempotente de tentativa numerada;
- respostas incrementais com optimistic locking;
- validação dos quatro tipos de resposta e de `N/A` pelo backend;
- pontuação calculada exclusivamente pelo backend;
- evidência JPEG, PNG ou WebP vinculada à resposta exata;
- validação por magic bytes, limite de 10 MB, object key opaco e SHA-256 confirmado;
- remoção local de metadados EXIF/XMP e textos auxiliares suportados;
- storage local descartável, fora do repositório, com compensação de arquivo órfão;
- bloqueio de submissão sem resposta ou foto obrigatória;
- congelamento da tentativa e das respostas após submissão;
- isolamento por organização, estabelecimento, responsável e capability efetiva;
- tela React mobile-first para responder, salvar, fotografar e enviar.

Resultados finais:

```text
Prisma schema:                    válido
migrations em replay vazio:       63/63
HTTP + PostgreSQL da Entrega 4:    1/1
backend completo:                299/299 (9 integrações condicionais ignoradas)
frontend completo:                57/57
build frontend:                   aprovado com avisos legados fora do checklist
```

Decisão: **Entrega 4 concluída localmente. GO técnico para preparar a Entrega 5 em gate separado. NO-GO para aprovação/rejeição, storage remoto, staging, produção ou publicação automática.**

## 2. Migration 63 e persistência

Migration criada:

```text
20261120193000_add_checklist_execution
```

SHA-256:

```text
007bf3e9f335e6837c6be280063d6eb540ddceadde0af95efe689458b75e37d3
```

Estruturas adicionadas:

- `ChecklistExecutionAttempt`;
- `ChecklistResponse`;
- `ChecklistEvidence`;
- enums de estado da tentativa, resultado da resposta e estado da evidência;
- novos eventos `ATTEMPT_STARTED`, `RESPONSE_SAVED`, `EVIDENCE_ADDED` e `ATTEMPT_SUBMITTED`;
- índices por executor/status, item/resultado, resposta/evidência e upload;
- FKs históricas com `ON DELETE RESTRICT`;
- guards de responsável, unidade, versão do template e estado aberto;
- bloqueio de deleção de tentativa/resposta e atualização/deleção de evidência.

O replay desde banco vazio aplicou as 63 migrations. O upgrade da base descartável com as 62 migrations anteriores também foi validado.

## 3. Contrato HTTP entregue

Rotas autenticadas sob `/api/checklists`:

| Método | Rota | Regra |
|---|---|---|
| GET | `/my-runs` | `checklists.execute` e responsável atual |
| POST | `/runs/:runId/start` | `checklists.execute` e responsável atual |
| GET | `/attempts/:attemptId` | executor da tentativa e responsável atual |
| PUT | `/attempts/:attemptId/responses/:itemId` | tentativa aberta e versão observada |
| POST | `/responses/:responseId/evidences` | resposta da tentativa aberta |
| GET | `/evidences/:evidenceId/content` | acesso autenticado e escopado ao executor |
| POST | `/attempts/:attemptId/submit` | tentativa aberta, completa e na versão observada |

O fallback LEGACY de execução permanece limitado a `ADMIN`, `MANAGER`, `STAFF` e `STOCK_COUNTER`. No modo PROFILED, a decisão usa `checklists.execute` e reavalia overrides em cada requisição.

## 4. Concorrência, pontuação e imutabilidade

- iniciar novamente a mesma ocorrência aberta devolve a tentativa vigente;
- `runId + attemptNumber` impede duplicação de tentativa;
- respostas usam `version` e atualização condicional;
- versão obsoleta retorna 409;
- submissão recalcula todas as respostas com a versão congelada do template;
- resposta obrigatória ausente ou evidência obrigatória indisponível retorna 422;
- item crítico reprovado mantém a tentativa não conforme, independentemente da média;
- tentativa submetida recebe score, pontos obtidos/aplicáveis e resultado final;
- submissão torna tentativa e respostas imutáveis para o executor;
- eventos operacionais permanecem append-only.

## 5. Evidências locais

O adapter desta entrega usa `CHECKLIST_EVIDENCE_DIR` ou um diretório temporário do sistema. Ele não grava binários no PostgreSQL nem dentro do repositório.

Controles entregues:

- formatos aceitos: JPEG, PNG e WebP;
- detecção pelo conteúdo real do arquivo;
- máximo de 10 MB por imagem e cinco imagens disponíveis por resposta;
- nomes opacos baseados em UUID;
- remoção de APP1/APP13 em JPEG, eXIf/textos em PNG e EXIF/XMP em WebP;
- leitura de confirmação e checksum SHA-256;
- acesso por endpoint autenticado, sem URL pública permanente;
- remoção compensatória se a persistência do metadado falhar.

Este adapter é exclusivamente local e descartável. Provider remoto, malware scanning, retenção e backup continuam pendentes para gate de produção.

## 6. Interface entregue

Rotas React:

```text
/checklists
/checklists/execute/:attemptId
```

A fila “Meus checklists” aparece para quem possui `checklists.execute`. A mesma página mantém a distribuição da unidade somente para quem possui `checklists.runs.manage`.

A execução oferece:

- progresso por quantidade respondida;
- controles específicos para BOOLEAN, CHOICE, NUMBER e TEXT;
- opção `N/A` somente quando permitida;
- observação por item;
- salvamento incremental visível;
- captura/seleção de foto com preview;
- quantidade de fotos confirmadas;
- envio final e resumo de pontuação.

## 7. Evidências de validação

Foram exercitados:

- schema e geração do Prisma Client;
- upgrade 62 → 63 e replay 1 → 63 em PostgreSQL descartável;
- responsável incorreto sem visibilidade ou execução;
- fila pessoal isolada;
- início repetido sem nova tentativa;
- optimistic locking de respostas;
- foto obrigatória antes da submissão;
- sanitização e leitura autenticada da imagem;
- submissão e cálculo de score;
- bloqueio de edição e deleção após submissão;
- inventário das 21 rotas do domínio;
- navegação por capabilities;
- testes React da fila, execução e reservas;
- suíte backend completa, suíte frontend completa e build otimizado.

O build manteve avisos ESLint já existentes em páginas fora do domínio de checklists e o aviso de tamanho do bundle. Nenhum aviso novo da Entrega 4 permaneceu.

## 8. Fora do escopo e próximo gate

Permanecem fora desta entrega:

- aprovação e rejeição;
- retrabalho por nova tentativa após rejeição;
- timeline pública completa e relatórios;
- provider remoto e URLs assinadas;
- retenção, quotas, scanning e backup;
- offline completo;
- recorrência, scheduler, turnos e atribuição automática.

A Entrega 5 deverá adicionar aprovação append-only, separação executor/aprovador, rejeição justificada, nova tentativa, timeline e congelamento definitivo da decisão. Ela não foi iniciada automaticamente.
