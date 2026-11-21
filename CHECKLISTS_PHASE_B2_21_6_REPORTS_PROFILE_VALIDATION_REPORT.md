# BASTIDOR OS — B2.21.6: relatórios e validação final dos perfis

> Data de conclusão: 21 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> HEAD/base preservado: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **Entrega 6 implementada e validada localmente; nenhum storage remoto, commit, push, merge, deploy ou acesso à produção executado**

## 1. Resultado executivo

A Entrega 6 concluiu o recorte técnico local do MVP de checklists com:

- relatório agregado por período no estabelecimento ativo;
- filtros por template, versão e responsável atual;
- agrupamento explícito por versão para impedir comparações silenciosas;
- indicadores de pontuação, conformidade, conclusão, prazo, retrabalho e falhas críticas;
- ranking de itens reprovados por `stableKey` e versão;
- volumes por executor e aprovador;
- listagem paginada das ocorrências que compõem o resultado;
- isolamento por organização e estabelecimento derivados da sessão;
- navegação React controlada pela capability efetiva;
- validação contratual dos seis perfis PROFILED e do fallback LEGACY;
- índices específicos para período e tentativas submetidas.

Resultados finais:

```text
Prisma schema:                    válido
migrations em replay vazio:       65/65
HTTP + PostgreSQL da Entrega 6:    1/1
backend completo:                303 aprovados (314 total; 11 integrações condicionais ignoradas)
frontend completo:                65/65
gates de encoding e UI:           aprovados
build frontend:                   aprovado com avisos legados fora do checklist
```

Decisão: **Entrega 6 concluída localmente. O escopo técnico planejado das Entregas 1–6 está implementado. Permanecem em NO-GO a publicação, produção, provider remoto de evidências e qualquer ampliação de leitura para AUDITOR sem decisão contratual própria.**

## 2. Migration 65 e persistência

Migration criada:

```text
20261121120000_add_checklist_report_indexes
```

SHA-256:

```text
ec93261017bbf1a05091e66ac09434a17e27169c36fa652103343547ff4a83cb
```

Índices adicionados:

- `checklist_runs(establishmentId, dueAt)` para o recorte temporal da unidade;
- `checklist_execution_attempts(submittedAt, status)` para consultas de tentativas concluídas.

O upgrade da base descartável aplicou a migration 65, e um banco vazio separado reproduziu as 65 migrations até `Database schema is up to date`.

## 3. Contrato HTTP e limites

Nova rota autenticada:

```text
GET /api/checklists/reports
```

Parâmetros aceitos:

| Parâmetro | Regra |
|---|---|
| `from`, `to` | datas reais no formato `YYYY-MM-DD`; padrão de 30 dias; máximo de 366 dias |
| `templateId` | UUID de template pertencente ao tenant atual |
| `templateVersionId` | UUID de versão pertencente ao tenant atual |
| `responsibleMembershipId` | UUID de membership da unidade atual |
| `page` | inteiro positivo |
| `limit` | entre 1 e 100; padrão 25 |

O período é aplicado sobre `ChecklistRun.dueAt` e convertido pelas fronteiras do fuso `America/Sao_Paulo`. A unidade não é escolhida por ID do cliente: é sempre o estabelecimento ativo da sessão. Uma tela organizacional multiunidade permanece fora deste recorte.

A agregação é limitada a 5.000 ocorrências. Se o recorte exceder esse teto, o backend retorna erro de validação 422 orientando o usuário a reduzir o período ou aplicar filtros, em vez de produzir um resultado parcial silencioso.

## 4. Métricas e agrupamentos

O relatório entrega:

- total de ocorrências e contagem por status;
- quantidade avaliada e pontuação média;
- taxa de conformidade;
- taxa de conclusão;
- ocorrências concluídas dentro do prazo;
- ocorrências atrasadas e atrasadas ainda não iniciadas;
- ocorrências com retrabalho e com falha crítica;
- agrupamento por template e versão exata;
- agrupamento por responsável atual;
- volumes por executor e aprovador;
- até 20 itens com mais falhas, identificados por versão e `stableKey`;
- ocorrências paginadas com prazo, status, responsável, tentativa e score.

As opções de filtro também são limitadas à organização e ao estabelecimento ativos. Um UUID válido pertencente a outro tenant não produz vazamento: retorna conjunto vazio e não aparece nas opções.

## 5. Autorização e seis perfis

Não foi criada uma permissão nova ou ampliado o acesso do `AUDITOR`. O relatório reutiliza `checklists.approve`, coerente com a leitura de resultados submetidos e aprovados.

Matriz PROFILED validada:

| Perfil | Acesso ao relatório |
|---|---:|
| OWNER | sim |
| ADMINISTRATOR | sim |
| MANAGER | sim |
| SUPERVISOR | sim |
| COLLABORATOR | não |
| AUDITOR | não |

Overrides continuam sendo reavaliados pelo resolvedor: `DENY` remove o acesso e um `ALLOW` somente é considerado conforme o contrato delegável vigente. No modo LEGACY, o fallback permanece restrito a `ADMIN` e `MANAGER`.

O frontend exibe “Relatórios de checklists” apenas quando `checklists.approve` está presente, mas o backend continua sendo a autoridade final.

## 6. Interface entregue

Nova rota React:

```text
/checklists/reports
```

A tela oferece:

- filtros de período, modelo, versão e responsável;
- cartões de ocorrências, pontuação, conformidade, conclusão, atraso e retrabalho;
- tabelas por modelo/versão e responsável;
- tabela de itens mais reprovados com destaque para criticidade;
- detalhe paginado das ocorrências;
- estados de carregamento, erro e vazio usando o design system existente.

## 7. Evidências de validação

Foram exercitados:

- validação e geração do Prisma Client;
- upgrade 64 → 65 e replay 1 → 65 em PostgreSQL descartável;
- agregação de score, conformidade, prazo, retrabalho e falhas;
- separação de versões do mesmo template;
- filtros combinados e paginação;
- datas inválidas, intervalo invertido e janela superior a 366 dias;
- limite protegido de 5.000 linhas;
- isolamento entre organizações e estabelecimentos;
- filtro estrangeiro sem vazamento de dados ou opções;
- autorização HTTP LEGACY para `ADMIN`, `MANAGER` e negação para executor;
- matriz PROFILED dos seis perfis;
- navegação por capability;
- suíte backend completa, suíte frontend completa, gates de texto/UI e build otimizado.

O build mantém avisos ESLint preexistentes em páginas fora do domínio de checklists e o aviso de tamanho do bundle. Nenhum aviso novo da página de relatórios permaneceu.

## 8. Fora do escopo e próximos gates

Permanecem fora da Entrega 6:

- capacidade somente leitura para `AUDITOR`;
- visão consolidada de múltiplos estabelecimentos;
- exportação CSV/PDF;
- provider remoto, URLs assinadas e política definitiva de retenção;
- quotas, malware scanning e backup de evidências;
- offline completo;
- recorrência, scheduler, turnos e atribuição automática;
- staging, produção, publicação ou ativação automática.

Qualquer uma dessas evoluções exige um novo gate e autorização específica.
