# BASTIDOR OS — B2.21.8: agendamento diário de checklists

> Data: 22 de novembro de 2026
> Estado: **implementado localmente; migration 69 e deploy ainda não executados**

## Resultado

O agendador de checklists passa a aceitar um conjunto de dias da semana escolhido visualmente. Uma rotina cria, em cada dia marcado e no horário configurado, uma nova `ChecklistRun` independente vinculada ao responsável escolhido.

Cada geração revalida estabelecimento, modelo publicado, membership ativo e a capacidade `checklists.execute`. A ocorrência do dia anterior permanece imutável e não é reaproveitada.

## Contrato

- marcar os sete dias representa uma rotina diária, inclusive sábados e domingos;
- marcar somente um dia preserva o comportamento semanal;
- qualquer combinação entre um e sete dias é aceita sem duplicatas;
- responsável fixo por agenda, sempre identificado por `UserEstablishment.id`;
- prazo calculado a partir do instante de cada geração;
- unicidade `scheduleId + scheduledFor` continua impedindo duplicidade;
- pausa, reativação, data final e falha fechada permanecem iguais;
- timezone operacional continua `America/Sao_Paulo`.

## Persistência

A migration aditiva `20261122223000_add_daily_checklist_schedules` adiciona `weekdays` como conjunto de inteiros, converte as agendas semanais anteriores, remove o campo singular `weekday` e aplica constraints de quantidade, faixa e unicidade.

## Interface

O botão passa a se chamar **Agendar rotina**. O formulário mostra os sete dias como botões marcáveis; todos começam selecionados para facilitar o checklist diário.

## Validação

- schema Prisma formatado, client regenerado e validação aprovada;
- regressão backend: 330 testes, 319 aprovados, 11 integrações PostgreSQL condicionais ignoradas e nenhuma falha;
- teste React da fila, atribuição e seleção de dias: 7/7 aprovados;
- codificação e componentes visuais aprovados;
- build otimizado local condicionado: o processo global foi encerrado por falta de memória da máquina, sem erro de compilação da tela; deve ser repetido no ambiente de CI antes do deploy.

## Gate

As migrations 68 e 69 devem ser aplicadas, nessa ordem, antes da publicação do backend e frontend desta extensão.
