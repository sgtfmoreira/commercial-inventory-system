# Checklists: publicação em produção

Este procedimento publica o módulo de checklists sem depender do filesystem efêmero do servidor e sem executar migrations durante o boot da aplicação.

## Pré-requisitos obrigatórios

- snapshot lógico validado ou PITR confirmado imediatamente antes da migration;
- branch de release reconciliada com a versão atualmente publicada;
- bucket privado do Supabase Storage criado para as evidências;
- variáveis secretas configuradas no backend, nunca no frontend;
- suíte backend, suíte frontend e build de produção aprovados.

## Variáveis do backend

```text
CHECKLIST_EVIDENCE_STORAGE_PROVIDER=SUPABASE
SUPABASE_URL=https://<projeto>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<segredo somente do backend>
CHECKLIST_EVIDENCE_BUCKET=checklist-evidence
CHECKLIST_SCHEDULER_ENABLED=true
CHECKLIST_SCHEDULER_INTERVAL_MS=60000
```

O bucket deve permanecer privado. A `SUPABASE_SERVICE_ROLE_KEY` não pode usar prefixo `REACT_APP_`, ser enviada ao navegador ou ser registrada em logs.

Fora de produção, a ausência de `CHECKLIST_EVIDENCE_STORAGE_PROVIDER` mantém o adapter local. Em produção, a ausência ou configuração inválida provoca falha fechada nas operações de evidência.

## Ordem de publicação

1. congelar o artefato de release e registrar o commit;
2. confirmar backup/PITR e validar a conexão de produção;
3. executar `npm run db:deploy` como job controlado ou, na ausência de Shell no Render, permitir que o comando de start execute `prisma migrate deploy` antes do servidor;
4. conferir `prisma migrate status` e os índices/constraints esperados;
5. publicar o backend com as variáveis de storage e scheduler já configuradas;
6. validar health check, autenticação e as rotas de checklist;
7. publicar o frontend apontando para o backend validado;
8. executar smoke test com uma organização e unidade de teste.

Nesta release, o `start` do backend executa `prisma migrate deploy` antes de iniciar o servidor. O Prisma aplica somente migrations pendentes sob lock; se a migration falhar, a nova instância não inicia e não deve receber tráfego. O comando não executa seed nem altera migrations já aplicadas.

## Smoke test

- autenticar um `ADMINISTRATOR` ou `MANAGER`;
- criar e publicar um modelo simples;
- criar uma execução e atribuí-la a um membership elegível;
- iniciar, salvar uma resposta e anexar uma imagem sem EXIF sensível;
- recarregar a execução e confirmar que a evidência continua acessível;
- submeter, revisar com outro usuário e aprovar ou rejeitar;
- abrir histórico e relatório, conferindo organização e estabelecimento;
- confirmar `403` para usuário sem capability e isolamento entre tenants.
- criar uma agenda diária de teste com horário próximo e confirmar geração única para o responsável;
- criar uma agenda semanal e confirmar que a frequência anterior continua funcionando;
- pausar a agenda e confirmar que nenhuma nova ocorrência é materializada;

## Recuo seguro

- interromper novos deploys e manter o banco intacto;
- reverter backend e frontend ao commit anterior compatível;
- não apagar migrations aplicadas nem tabelas históricas;
- se a falha estiver apenas nas evidências, desabilitar temporariamente o fluxo de upload na aplicação, preservando os objetos e metadados existentes;
- se a falha estiver no agendador, definir `CHECKLIST_SCHEDULER_ENABLED=false` e reiniciar o backend; agendas e ocorrências já criadas permanecem preservadas;
- restaurar banco somente em incidente confirmado e conforme o procedimento de backup aprovado.

