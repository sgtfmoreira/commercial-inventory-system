# Relatório de aceite — Eventos Fase 01

**Data:** 06/10/2026
**Fonte oficial de aceite:** `docs/PRD_EVENTOS_FASE_01.md`
**Escopo da rodada:** auditoria final e correções mínimas para homologação, sem iniciar a Fase 02.

## 1. Decisão executiva

| Pergunta | Resposta |
|---|---|
| A Fase 01 está aceita para homologação? | **Sim.** Os critérios automatizáveis críticos estão verdes e o fluxo comercial real foi validado por HTTP. |
| Pode ir para piloto controlado? | **Sim, condicionado a uma conferência visual manual curta da proposta/PDF no navegador do ambiente alvo.** |
| Pode ir para produção ampla? | **Ainda não.** Faltam aceite visual/responsivo, evidência operacional de backup/PITR anexada à liberação e aceite do negócio no piloto. |
| Houve avanço para Fase 02? | **Não.** Não foram criados estoque, reserva, compras, necessidades, produção, baixa ou integração operacional. |

Não há bloqueador conhecido no núcleo comercial para iniciar homologação. Os gaps restantes de listagem/histórico são acabamento importante, mas possuem alternativa funcional e não impedem testar o fluxo principal.

## 2. Rastreabilidade do PRD

O arquivo canônico não existia no início desta rodada. Foi criado em `docs/PRD_EVENTOS_FASE_01.md` a partir do plano de implementação que declara ter sido derivado do PRD original, dos requisitos preservados no relatório de implementação e da análise do módulo.

Essa versão passa a ser a fonte de aceite no repositório. Como controle documental, se uma cópia anterior do PRD original for recuperada, deve ser feito um diff antes de substituí-la. Essa ressalva **não bloqueia homologação**, mas exige confirmação de produto antes da produção ampla.

## 3. Correções de fechamento realizadas

### 3.1 Estados de erro do frontend

Arquivos:

- `src/pages/EventBudgetEditor.js`
- `src/pages/NewEvent.js`
- `src/pages/Events.test.js`

Resultado:

- o editor não permanece mais indefinidamente em “Carregando orçamento...” quando a API falha;
- erro de orçamento mostra mensagem clara, link para voltar ao evento e botão “Tentar novamente”;
- falha do catálogo é mostrada sem impedir o uso de item manual, com nova tentativa disponível;
- falha ao carregar clientes não é mais silenciosa;
- o seletor indica carregamento, mostra a causa e oferece nova tentativa;
- respostas antigas são ignoradas quando orçamento ou estabelecimento mudam;
- dois testes frontend novos cobrem erro e recuperação.

### 3.2 Smoke HTTP autenticado

Arquivos:

- `backend/scripts/smoke-events-http-authenticated.js`
- script npm `events:smoke-http` em `backend/package.json`

O smoke inicia a aplicação Express real em porta efêmera e atravessa middleware, controller, service, repository e PostgreSQL. Ele cria usuários e dados com marcador único `[SMOKE-EVENTS-HTTP-*]`, encerra o servidor e remove eventos, clientes, vínculos e usuários em `finally`, verificando que não restaram fixtures.

Cobertura executada:

- `ADMIN` autorizado;
- `MANAGER` autorizado;
- `STOCK_COUNTER` bloqueado com 403;
- requisição sem token bloqueada com 401;
- dois estabelecimentos;
- acesso cruzado a cliente, evento e orçamento retorna 404;
- cliente → evento/revisão 1 → item → precificação → envio → proposta/PDF → revisão 2 → envio → aprovação;
- proposta JSON sem campos financeiros internos;
- PDF com `Content-Type` correto, assinatura `%PDF` e conteúdo não vazio;
- comparação antes/depois de `Product.quantity` e `ProductStock.quantity`;
- comparação antes/depois das contagens de `StockMovement`, `PurchaseOrder`, `Sale` e `ConsumptionEvent`.

Resultado: **aprovado**, inclusive `protectedModulesUnchanged: true`.

### 3.3 PDF longo e acentuação

Foi adicionado teste com 160 itens e textos como “Associação”, “São José”, “celebração”, “canapé”, “café”, “pão de queijo”, “recepção” e “condições”. A geração termina sem erro e produz PDF com mais de uma página.

O navegador integrado não estava disponível nesta sessão. Portanto:

- geração, multipaginação e entrada Unicode foram validadas programaticamente;
- a aparência dos glifos, quebras de página e impressão **não foi certificada visualmente**;
- a conferência visual permanece como condição antes do piloto com dados reais.

### 3.4 Checklist de release

`docs/EVENTS_PHASE_01_RELEASE.md` foi corrigido:

- migration está registrada como aplicada e não aparece mais como pendência;
- `events:readiness` confirma `deployRequired: false`;
- backup/PITR está descrito como gate já confirmado para o deploy, com evidência externa a preservar;
- smoke autenticado foi incluído nos comandos e no estado verificado;
- pendência atual foi reduzida à validação visual e aceite do piloto.

## 4. Diff final — PRD versus implementação

Legenda: **Implementado**, **Parcial**, **Ausente**, **Fora de escopo**.

| Requisito do PRD | Status | Arquivos/rotas | Observação | Bloqueia homologação? |
|---|---|---|---|---:|
| PRD canônico no repositório | Implementado | `docs/PRD_EVENTOS_FASE_01.md` | Recomposto com nota de origem; confirmar com produto se o original reaparecer. | Não |
| `ADMIN` acessa o módulo | Implementado | rotas de Eventos, `authMiddleware`, `requireRole` | Confirmado por HTTP real. | Não |
| `MANAGER` acessa o módulo | Implementado | mesmas rotas | Confirmado por HTTP real. | Não |
| Papel não permitido recebe 403 | Implementado | `requireRole` | `STOCK_COUNTER` confirmado no smoke. | Não |
| Ausência de autenticação recebe 401 | Implementado | `authMiddleware` | Confirmado no smoke. | Não |
| Tenant vem do JWT | Implementado | middleware/services/repository | IDs do cliente não são autoridade. | Não |
| Isolamento entre estabelecimentos | Implementado | repository e services | Cliente, evento e orçamento testados com dois tenants. | Não |
| Cadastrar cliente | Implementado | `POST /api/event-customers`, `NewEvent.js` | Cadastro rápido funcional. | Não |
| Buscar/paginar clientes | Implementado | `GET /api/event-customers`, `NewEvent.js` | Busca por nome/documento com respostas paginadas. | Não |
| Consultar/atualizar cliente | Implementado | `GET/PATCH /api/event-customers/:id`, `NewEvent.js` | Cliente selecionado pode ser atualizado durante a criação do evento. | Não |
| Criar evento e revisão 1 atomicamente | Implementado | `POST /api/events`, `commercialEventService.js` | Teste unitário e smoke HTTP. | Não |
| Selecionar responsável pelo evento | Implementado | `GET /api/events/responsible-users`, `NewEvent.js` | Lista apenas vínculos ativos do estabelecimento autenticado; funciona para ADMIN e MANAGER. | Não |
| Código único por estabelecimento | Implementado | service + índice único | UUID compõe o código. | Não |
| Listagem com busca e status | Implementado | `GET /api/events`, `Events.js` | Funcional. | Não |
| Paginação e filtros de período na UI | Implementado | `Events.js` | Controles de página e intervalo de datas conectados à API. | Não |
| Detalhe do evento | Implementado | `GET /api/events/:id`, `EventDetail.js` | Funcional. | Não |
| Editar/cancelar evento | Implementado | `PATCH`, `POST /cancel`, `EventDetail.js` | Edição limitada a evento com revisão em rascunho; cancelamento exige confirmação. | Não |
| Histórico resumido de revisões | Implementado | `GET /api/events/:id`, `EventDetail.js` | Todas as revisões vêm embutidas. | Não |
| Endpoint dedicado de histórico | Implementado | `GET /api/events/:eventId/budgets` | Tenant validado antes da consulta das revisões. | Não |
| Histórico mostra valor e datas | Implementado | `EventDetail.js` | Mostra valor, autoria, envio, aprovação, status e links. | Não |
| Item manual | Implementado | editor + budget service | Funcional desde a revisão 1. | Não |
| Produto/ficha somente leitura | Implementado | `GET /api/events/catalog-items` | Snapshot sem FK operacional. | Não |
| Snapshot de custo/composição | Implementado | catalog/budget services | Ingredientes diretos e fonte de custo preservados. | Não |
| Grupos de custo completos | Implementado | schema/editor/pricing | Sete grupos previstos. | Não |
| Quantidade fixa/por convidado | Implementado | item service/pricing | Com margem de segurança. | Não |
| Recálculo no servidor | Implementado | `eventBudgetService.js` | Após itens, premissas e convidados. | Não |
| Decimal como fonte financeira | Implementado | `eventPricingService.js`, Prisma | Coberto por testes. | Não |
| Preço recomendado por gross-up | Implementado | pricing service | Inclui encargos sobre receita. | Não |
| Preço negociado/manual | Implementado | budget endpoint/painel | Apenas em `DRAFT`. | Não |
| Lucro, margem efetiva e CMV | Implementado | pricing service/painel | Persistidos e exibidos. | Não |
| Preço/custo/lucro por convidado | Implementado | pricing service/painel | Persistidos e exibidos. | Não |
| Alertas de margem/equilíbrio | Implementado | pricing service | Não bloqueiam rascunho. | Não |
| Checklist antes do envio | Implementado | budget/workflow services | Item de menu, visível, preço e custos válidos. | Não |
| Proposta HTML pública | Implementado | `/proposal`, `EventProposal.js` | Sem campos internos. | Não |
| PDF público | Implementado | `/proposal.pdf`, PDF service | Estrutura, privacidade e múltiplas páginas testadas. | Não |
| Validação visual do PDF | Parcial | roteiro da seção 7 | Navegador não disponível nesta execução. | Não para homologação; sim antes do piloto |
| Snapshot de cliente/evento no envio | Implementado | workflow service | Confirmado por teste. | Não |
| Snapshot estável de catálogo | Implementado | catalog/budget services | Alteração da origem não muda item salvo. | Não |
| `DRAFT` editável | Implementado | services/UI | Funcional. | Não |
| `SENT` imutável | Implementado | services/UI | Mutações rejeitadas. | Não |
| `APPROVED` imutável | Implementado | services/UI | Mutações rejeitadas. | Não |
| Rejeição | Implementado | `POST /reject` | A partir de `SENT`. | Não |
| Expiração | Parcial | list/get + repository | Oportunista na leitura, sem scheduler/auditoria específica. Aceito para a fase. | Não |
| Nova revisão | Implementado | `POST /new-revision` | Copia itens/premissas com novos IDs. | Não |
| Aprovação apenas de `SENT` | Implementado | workflow service | Confirmado. | Não |
| Apenas uma revisão aprovada | Implementado | transação + índice parcial | Defesa de aplicação e banco. | Não |
| Auditoria de ações críticas | Implementado | `AuditLog` | Envio, rejeição, nova revisão, aprovação e cancelamento. | Não |
| Mensagem de erro e retry no editor | Implementado | `EventBudgetEditor.js` | Corrigido nesta rodada e testado. | Não |
| Mensagem de erro ao carregar clientes | Implementado | `NewEvent.js` | Corrigido nesta rodada e testado. | Não |
| Troca de estabelecimento limpa editor | Implementado | editor + teste frontend | Confirmado. | Não |
| Desktop/mobile/teclado | Parcial | frontend | CSS adaptativo existe; falta inspeção manual. | Não para homologação; sim antes da produção ampla |
| Migration aditiva | Implementado | migration da Fase 01 | Readiness sem tokens destrutivos. | Não |
| Migration aplicada | Implementado | `_prisma_migrations`/readiness | `migrationApplied: true`. | Não |
| Não alterar `Product.quantity` | Implementado | smoke HTTP | Snapshot antes/depois idêntico. | Não |
| Não alterar `ProductStock.quantity` | Implementado | smoke HTTP | Snapshot antes/depois idêntico. | Não |
| Não criar `StockMovement` | Implementado | smoke HTTP | Contagem inalterada. | Não |
| Não criar `PurchaseOrder` | Implementado | smoke HTTP | Contagem inalterada. | Não |
| Não criar `Sale` | Implementado | smoke HTTP | Contagem inalterada. | Não |
| Não alterar `ConsumptionEvent` | Implementado | smoke HTTP | Contagem inalterada e namespace separado. | Não |
| Release/rollback documentado | Implementado | `EVENTS_PHASE_01_RELEASE.md` | Contradição removida. | Não |

## 5. Evidências de teste

| Verificação | Resultado final |
|---|---|
| Backend completo — `npm.cmd test` | **157/157 aprovados** |
| Backend Eventos — suíte focada | **48/48 aprovados** |
| Frontend Eventos — `npm.cmd run test:events` | **14/14 aprovados** |
| Prisma — `npx.cmd prisma validate` | **Válido** |
| Readiness — `npm.cmd run events:readiness` | **Aprovado**; migration aplicada, tabelas/índices presentes |
| Smoke DB — `npm.cmd run events:smoke-db` | **Aprovado**; relações, 55 registros de paginação e rollback |
| Smoke core readonly — `npm.cmd run core:smoke-readonly` | **Aprovado** |
| Smoke HTTP autenticado — `npm.cmd run events:smoke-http` | **Aprovado**; autorização, tenant, workflow, PDF e não regressão |
| Navegador/inspeção visual | **Não executado**; nenhum navegador conectado estava disponível |

O primeiro ensaio do novo teste de PDF falhou apenas por um limite arbitrário de tamanho do arquivo, apesar de o PDF possuir três páginas. O limite foi corrigido para validar o comportamento relevante — assinatura, conteúdo mínimo e mais de uma página — e a suíte completa passou. Não houve correção funcional motivada por esse ensaio.

## 6. Pendências classificadas

### 6.1 Bloqueiam produção ampla

1. Executar a validação visual/responsiva e de impressão/PDF da seção 7 em navegador real.
2. Realizar piloto acompanhado e obter aceite do responsável de produto/comercial.
3. Anexar ao registro operacional a evidência do backup/PITR usada no gate do deploy.
4. Confirmar com produto a versão recomposta do PRD ou confrontá-la com o original, caso ele seja recuperado.

### 6.2 Apenas acabamento; não bloqueiam homologação nem piloto controlado

- padronização de 400 versus 422;
- auditoria específica de expiração;
- centralização da matriz de transições para evitar duplicidade futura;
- teste de concorrência real em duas conexões, além da constraint e simulação existentes.

### 6.3 Fase 02 — não fazer agora

- reserva ou disponibilidade comprometida de estoque;
- necessidades de insumos e compra;
- criação ou alocação de ordens de compra;
- produção, separação, checkout, retorno ou perda;
- movimentos ou baixa de estoque;
- custo realizado e previsto versus realizado;
- criação de venda/faturamento;
- integração operacional com `ConsumptionEvent`;
- planejamento de equipe, equipamentos ou capacidade;
- cotação formal, contratos e assinatura eletrônica.

## 7. Roteiro visual obrigatório antes do piloto

1. Abrir listagem, novo evento, detalhe, editor e proposta em 375 px, 768 px e desktop.
2. Percorrer tudo por teclado; confirmar foco visível e ordem coerente.
3. Forçar 401, 403, 404 e indisponibilidade de API no editor e em novo evento; testar “Tentar novamente” e “Voltar”.
4. Abrir proposta com acentos: `ç`, `ã`, `á`, `é`, `í`, `ó`, `ú`, travessão e símbolo monetário.
5. Gerar proposta longa, conferir cabeçalhos, itens, páginas intermediárias, total, validade e observações.
6. Confirmar visualmente que não aparecem custo, lucro, margem, CMV ou notas internas.
7. Imprimir/salvar como PDF em A4 e revisar cortes, margens e páginas em branco.
8. Reabrir proposta enviada após alterar cliente/origem e confirmar que o snapshot permanece igual.

## 8. Aceite final

### Homologação

**ACEITA.** O domínio, autenticação, autorização, multi-tenancy, cálculo, snapshots, workflow, proposta e não regressão operacional possuem evidência automatizada suficiente para iniciar a homologação.

### Piloto controlado

**APTO COM UMA CONDIÇÃO:** executar e aprovar o roteiro visual da seção 7. Depois disso, um piloto acompanhado com `ADMIN`/`MANAGER` pode começar.

### Produção ampla

**NÃO ACEITA NESTE MOMENTO.** A negativa não decorre de falha conhecida no núcleo, mas da ausência de inspeção visual, aceite de negócio em piloto e fechamento das evidências operacionais/documentais listadas na seção 6.1.
