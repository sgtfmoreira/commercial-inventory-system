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
```

O bucket deve permanecer privado. A `SUPABASE_SERVICE_ROLE_KEY` não pode usar prefixo `REACT_APP_`, ser enviada ao navegador ou ser registrada em logs.

Fora de produção, a ausência de `CHECKLIST_EVIDENCE_STORAGE_PROVIDER` mantém o adapter local. Em produção, a ausência ou configuração inválida provoca falha fechada nas operações de evidência.

## Ordem de publicação

1. congelar o artefato de release e registrar o commit;
2. confirmar backup/PITR e validar a conexão de produção;
3. executar `npm run db:deploy` uma única vez como job controlado;
4. conferir `prisma migrate status` e os índices/constraints esperados;
5. publicar o backend com as variáveis de storage já configuradas;
6. validar health check, autenticação e as rotas de checklist;
7. publicar o frontend apontando para o backend validado;
8. executar smoke test com uma organização e unidade de teste.

O `build` e o `start` do backend não executam migrations. Isso evita duas instâncias concorrendo para alterar o schema durante um deploy.

## Smoke test

- autenticar um `ADMINISTRATOR` ou `MANAGER`;
- criar e publicar um modelo simples;
- criar uma execução e atribuí-la a um membership elegível;
- iniciar, salvar uma resposta e anexar uma imagem sem EXIF sensível;
- recarregar a execução e confirmar que a evidência continua acessível;
- submeter, revisar com outro usuário e aprovar ou rejeitar;
- abrir histórico e relatório, conferindo organização e estabelecimento;
- confirmar `403` para usuário sem capability e isolamento entre tenants.

## Recuo seguro

- interromper novos deploys e manter o banco intacto;
- reverter backend e frontend ao commit anterior compatível;
- não apagar migrations aplicadas nem tabelas históricas;
- se a falha estiver apenas nas evidências, desabilitar temporariamente o fluxo de upload na aplicação, preservando os objetos e metadados existentes;
- restaurar banco somente em incidente confirmado e conforme o procedimento de backup aprovado.

