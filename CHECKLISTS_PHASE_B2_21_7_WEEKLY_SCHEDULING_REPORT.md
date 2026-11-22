# BASTIDOR OS — B2.21.7: agendamento semanal de checklists

> Data: 22 de novembro de 2026
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`
> Estado: **implementado e validado localmente; migration 68 e deploy de produção ainda não executados**

## Resultado

O módulo passa a suportar agendas semanais automáticas sem alterar o fluxo de criação manual existente. Um gestor autorizado escolhe modelo publicado, responsável elegível, dia da semana, horário, prazo após a geração e período opcional. O backend calcula a próxima ocorrência no timezone `America/Sao_Paulo` e um worker idempotente materializa `ChecklistRun` quando a agenda vence.

## Contrato funcional

- somente `checklists.runs.manage` cria, pausa ou reativa agendas;
- frequência inicial exclusivamente semanal;
- cada agenda fixa uma versão publicada do modelo;
- responsável é um `UserEstablishment` ativo e com `checklists.execute` efetiva;
- cada ocorrência recebe `scheduleId` e `scheduledFor`;
- unicidade `scheduleId + scheduledFor` impede geração duplicada;
- o `clientRequestId` automático é determinístico por agenda e instante agendado;
- o worker reavalia unidade, modelo, membership e permissão antes de cada geração;
- agenda inválida é pausada automaticamente com motivo visível;
- janela já expirada não gera tarefa retroativa vencida;
- data final encerra a agenda sem apagar ocorrências anteriores;
- criação, pausa e reativação são espelhadas em `SecurityAuditEvent`.

## Persistência

Migration aditiva proposta:

```text
20261122210000_add_checklist_weekly_schedules
```

Ela adiciona `ChecklistSchedule`, `ChecklistScheduleStatus`, referências opcionais em `ChecklistRun`, índices, FKs `Restrict`, checks de formato e triggers de consistência entre organização, unidade, modelo e memberships. Execuções manuais existentes permanecem com `scheduleId` e `scheduledFor` nulos.

## API e interface

Rotas novas:

```text
GET   /api/checklists/schedules
POST  /api/checklists/schedules
PATCH /api/checklists/schedules/:scheduleId/status
```

A tela `/checklists` recebe a ação **Agendar semanal**, formulário de recorrência, cards com próxima geração e controles para pausar/reativar.

## Worker

O worker inicia somente em `backend/src/server.js`, nunca ao importar o Express em testes. O ciclo padrão é de 60 segundos, com trava em processo e idempotência no PostgreSQL para múltiplas instâncias.

Variáveis opcionais:

```text
CHECKLIST_SCHEDULER_ENABLED=true
CHECKLIST_SCHEDULER_INTERVAL_MS=60000
```

Definir `CHECKLIST_SCHEDULER_ENABLED=false` interrompe novas gerações sem apagar agendas ou ocorrências.

## Validação executada

- Prisma schema formatado e válido;
- Prisma Client regenerado;
- regressão backend completa: 328 testes, 317 aprovados, 11 integrações PostgreSQL condicionais ignoradas e nenhuma falha;
- 33 testes de checklist aprovados, 11 integrações PostgreSQL condicionais ignoradas sem banco local;
- 13 testes focados de agenda, contratos e rotas aprovados;
- 7 testes React da fila e agenda aprovados;
- codificação e design system aprovados;
- nenhuma migration ou escrita em produção executada nesta etapa.

## Gate de produção

Ordem obrigatória:

1. congelar e versionar o commit;
2. obter snapshot/PITR imediatamente anterior;
3. aplicar a migration 68 como job único;
4. validar tabela, constraints, triggers e status do Prisma;
5. publicar backend com worker inicialmente habilitado;
6. publicar frontend;
7. criar uma agenda de teste com horário próximo e confirmar uma única ocorrência;
8. pausar a agenda de teste e confirmar ausência de novas gerações.

Não publicar o backend novo antes da migration: o worker consulta `checklist_schedules` logo após o boot.
