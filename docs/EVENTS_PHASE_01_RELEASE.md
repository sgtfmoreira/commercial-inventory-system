# Eventos Fase 01 — liberação e rollback

## Estado verificado em 06/10/2026

- O datasource configurado aponta para PostgreSQL remoto no Supabase.
- O Prisma reconhece 45 migrations.
- A migration `20261005120000_add_commercial_events_phase_01` foi aplicada com sucesso; as 45 migrations estão atualizadas.
- O schema Prisma é válido e o build de produção conclui.
- A migration é aditiva: cria seis enums, quatro tabelas, índices, constraints e chaves estrangeiras. Ela não atualiza nem remove registros existentes.
- O snapshot lógico integral não foi criado, pois exportaria todos os registros do banco compartilhado. O deploy foi autorizado após confirmação do gate de backup/PITR.
- O smoke transacional criou cliente, evento, orçamento, item e 55 eventos de paginação, validou as relações/índices e confirmou rollback integral sem dados persistidos.
- O smoke pós-deploy dos módulos existentes consultou produtos, fichas, estoque, movimentos, compras, vendas e `ConsumptionEvent` em transação somente leitura.
- O smoke HTTP autenticado percorreu Express, autenticação, autorização, controllers e services com `ADMIN`, `MANAGER`, papel proibido, ausência de token e dois tenants. O fluxo completo chegou à aprovação, confirmou que os módulos operacionais não mudaram e removeu os dados de teste.

## Gate antes do deploy

Executar em `backend`:

```powershell
npm.cmd run events:readiness
npm.cmd run events:smoke-db
npm.cmd run events:smoke-http
npm.cmd run core:smoke-readonly
npm.cmd test
cd ..
npm.cmd run test:events
npm.cmd run test:stock-movement
npm.cmd run build
```

O relatório de readiness deve indicar:

- `readyForControlledDeploy: true`;
- `additiveOnlyByStaticCheck: true`;
- todas as tabelas-base presentes;
- antes do deploy, `deployRequired: true`;
- depois do deploy, `migrationApplied: true` e as quatro tabelas de eventos presentes.

Antes de aplicar, confirmar no painel do Supabase que existe backup/PITR recuperável e registrar a janela de manutenção. O backend novo não deve ser publicado antes da migration.

## Deploy

Na janela controlada:

```powershell
cd backend
npm.cmd run db:deploy
npm.cmd run db:generate
npm.cmd run events:readiness
cd ..
npm.cmd run build
```

Depois, publicar backend e frontend da mesma revisão e executar o smoke funcional autenticado:

1. listar produtos e fichas sem alterar cadastros;
2. abrir estoque, compras, vendas e Eventos de Marketing;
3. criar cliente de teste e evento comercial;
4. incluir item manual e item de catálogo;
5. salvar precificação e gerar proposta/PDF;
6. enviar, rejeitar, criar nova revisão e aprovar;
7. confirmar que revisão enviada/aprovada permanece somente leitura;
8. confirmar isolamento trocando de estabelecimento;
9. cancelar/remover apenas os dados de teste conforme a política operacional.

## Rollback

### Aplicação

Como a migration é aditiva, o rollback preferencial é republicar a versão anterior do backend e frontend, mantendo as novas tabelas sem uso. Isso restaura o comportamento anterior sem tocar em estoque, compras, vendas ou eventos de consumo.

### Banco

Não apagar tabelas automaticamente e não editar `_prisma_migrations` manualmente.

- Se a migration falhar, interromper o deploy, registrar o erro e consultar `prisma migrate status` antes de qualquer correção.
- Se o backend novo ainda não tiver gravado eventos, preparar uma migration corretiva revisada; não executar SQL avulso em produção.
- Se já existirem eventos, preservar as quatro tabelas e fazer somente rollback da aplicação. Remoção estrutural passa a exigir exportação específica dos eventos, validação de dependências e aprovação explícita.
- Suspeita de impacto em tabelas anteriores exige restauração primeiro em ambiente isolado e reconciliação; não restaurar diretamente sobre produção.

## Confirmações e pendências pós-deploy

- **Migration:** aplicada; `events:readiness` confirma `migrationApplied: true`, `deployRequired: false`, quatro tabelas e índices esperados presentes. Não é mais uma pendência.
- **Backup/PITR:** o deploy foi autorizado após confirmação do gate de backup/PITR, conforme o registro desta liberação. A evidência do provedor deve permanecer anexada ao registro operacional da janela; não há nova ação de migration pendente.
- **Autenticação e tenant:** validados automaticamente por `events:smoke-http`, sem depender de credenciais humanas persistentes.
- **Pendente para produção ampla:** inspeção visual responsiva, acessibilidade por teclado e impressão/PDF em navegador conectado, seguida do aceite do piloto de negócio.
