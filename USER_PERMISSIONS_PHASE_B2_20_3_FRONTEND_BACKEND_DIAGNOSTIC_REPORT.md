# BASTIDOR OS — B2.20.3: Diagnóstico do frontend e validação independente do backend PROFILED

> Data de continuidade: 17 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> HEAD/base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **em execução; checklist de gates criado; nenhuma nova fase autorizada**

## 1. Área de checklist e regras de execução

Esta seção é a fonte de acompanhamento da B2.20.3. Um item só pode ser marcado como concluído quando houver evidência observável nesta execução. Resultados de backend não serão apresentados como validação visual ou ponta a ponta.

### 1.1 Regras permanentes

- [x] Trabalhar somente no worktree isolado de integração.
- [x] Preservar o worktree original.
- [x] Manter o ambiente B2.19.1 em LEGACY, sem alterar suas flags.
- [x] Usar somente PostgreSQL local descartável e dados fictícios.
- [x] Não alterar schema nem migrations e não criar a migration 61.
- [x] Não implementar ou executar o bootstrap operacional do primeiro OWNER.
- [x] Não acessar Supabase, Render, Stripe, GitHub remoto ou banco remoto.
- [x] Não executar staging, commit, push, merge ou deploy.
- [x] Não modificar código funcional, `package.json`, lockfiles ou arquivos compartilhados sem autorização complementar.
- [x] Limitar a alteração persistente desta etapa a este relatório.
- [ ] Não iniciar nova fase automaticamente após concluir a B2.20.3.

### 1.2 Gates antes do backend PROFILED

- [ ] Confirmar PostgreSQL em `127.0.0.1:55441` e database `bastidor_b2201_profiled`.
- [ ] Confirmar que o banco contém apenas fixtures sintéticas.
- [ ] Confirmar que `DATABASE_URL` do processo 3334 aponta exclusivamente para o banco 55441.
- [ ] Confirmar `USER_PERMISSIONS_ENABLED=true` apenas no processo 3334.
- [ ] Confirmar `USER_PERMISSIONS_KILL_SWITCH=false` apenas no processo 3334.
- [ ] Confirmar `CORS_ALLOWED_ORIGINS=http://localhost:3001` apenas no processo 3334.
- [ ] Confirmar ausência de URLs e credenciais remotas no processo do laboratório.
- [ ] Confirmar que 3000/3333/55440 continuam pertencendo ao B2.19.1.

### 1.3 Diagnóstico do frontend

- [x] Registrar Node `v24.19.0`, npm `11.17.0` e `react-scripts` `5.0.1`.
- [x] Registrar heap padrão do Node: aproximadamente 2.000 MiB.
- [x] Medir memória física: 3,53 GiB total e 0,34 GiB livre no instante observado.
- [x] Identificar os processos Node e suas linhas de comando.
- [x] Confirmar ausência de conflito na porta 3001.
- [x] Confirmar que a cópia B2.20.2 possui manifesto, lockfile, fontes e dependências diretas equivalentes à cópia B2.19.1.
- [x] Registrar stdout, stderr e código de saída das tentativas anteriores.
- [x] Identificar que o frontend B2.19.1 ativo usa outra cópia/processo e continua na porta 3000.
- [ ] Isolar cache/diretório/processo e obter causa comprovada ou hipóteses delimitadas.
- [ ] Aplicar somente solução operacional temporária, se comprovada e autorizada.
- [ ] Confirmar frontend 3001 respondendo antes de qualquer validação de navegador.

### 1.4 Matriz backend PROFILED

- [ ] Login dos seis perfis.
- [ ] Troca para estabelecimento autorizado.
- [ ] Leitura permitida por perfil.
- [ ] Escrita permitida quando o perfil possuir capacidade.
- [ ] Escrita ou leitura proibida diretamente por HTTP.
- [ ] Unidade sem vínculo rejeitada.
- [ ] Tenant vizinho rejeitado.
- [ ] Override `DENY` aplicado.
- [ ] Override `ALLOW` delegável aplicado.
- [ ] Capacidade indelegável recusada.
- [ ] Permissões financeiras verificadas por perfil aplicável.
- [ ] Autoelevação recusada sem persistência.
- [ ] Último OWNER protegido sem alteração de autoridade.
- [ ] PROFILED sem configuração `ACTIVE` falha fechado.
- [ ] Kill switch do laboratório retorna ao LEGACY.
- [ ] Persistência PostgreSQL conferida para sucessos e ausências de mutação.

### 1.5 Navegador

- [ ] Frontend 3001 comunica exclusivamente com backend 3334.
- [ ] Login visual dos seis perfis.
- [ ] Comparação de menus, páginas e botões com as capacidades efetivas.
- [ ] Validação desktop.
- [ ] Validação mobile.
- [ ] Divergências registradas sem correção automática.

### 1.6 Encerramento e entrega

- [ ] Registrar causa ou hipóteses restantes do frontend.
- [ ] Registrar matriz backend com HTTP e persistência.
- [ ] Registrar estado final real de cada serviço.
- [ ] Informar somente URLs efetivamente disponíveis.
- [ ] Classificar problemas e recomendações por prioridade.
- [ ] Confirmar novamente staging vazio e restrições preservadas.
- [ ] Emitir GO/NO-GO da B2.20.3.

## 2. Evidências em coleta

Até este ponto, o diagnóstico confirmou que as duas cópias temporárias comparadas têm `package.json`, `package-lock.json`, árvores `src`/`public` e dependências diretas equivalentes. A máquina apresentava baixa memória livre no instante medido, mas isso ainda não constitui prova de encerramento por falta de memória. A investigação continuará separando concorrência de cache/processo, limites de recurso e compatibilidade do runtime.

