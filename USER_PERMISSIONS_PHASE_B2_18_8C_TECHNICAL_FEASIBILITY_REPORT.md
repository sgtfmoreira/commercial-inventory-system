# BASTIDOR OS — B2.18.8C: Prova de viabilidade técnica

> Data: 14 de novembro de 2026  
> Worktree: `C:\Users\Moreira\Desktop\commercial\.tools\integration-bastidor-permissions-b2`  
> Branch: `integration/bastidor-permissions-b2`  
> Base: `251d45bee486fc1af41e6ba2cff5ccc896dafc56`  
> Estado: **auditoria Git local aprovada; assinatura OpenSSH comum aprovada; FIDO2/UP/UV não comprovados; migration 61 bloqueada**

## 1. Resultado executivo

A prova local validou os mecanismos que não dependem de hardware FIDO2:

- OpenSSH assinou e verificou desafios com chaves Ed25519 descartáveis;
- alteração do desafio e troca de namespace invalidaram a assinatura;
- políticas locais rejeitaram replay e desafio expirado;
- duas fingerprints foram associadas ao mesmo `personId` e não satisfizeram separação de pessoas;
- revogação no cadastro bloqueou autorização embora a assinatura continuasse criptograficamente válida;
- recibos canônicos, cadeia de eventos, detecção de alteração e exportação Git idempotente foram aprovados;
- falha do recibo de intenção impediu a mutação simulada;
- falha do recibo final preservou estado recuperável e o retry concluiu a ancoragem.

O Windows possui OpenSSH 9.5p2, `ssh-keygen` reconhece `ed25519-sk` e `verify-required`, e `ssh-sk-helper.exe` está instalado. Entretanto, a tentativa descartável de enrollment FIDO2 terminou com:

```text
Key enrollment failed: invalid format
```

Nenhuma chave FIDO2 válida foi gerada. Não houve assinatura `sk`, logo não foi possível observar nem validar os bits de user presence (UP) e user verification (UV). Uma assinatura Ed25519 comum não comprova MFA.

Decisão: **NO-GO para alterar o schema Prisma ou criar a migration 61.** A auditoria independente demonstrou viabilidade local, mas o mecanismo de autenticação administrativa aprovado permanece sem prova de hardware. O próximo gate deve usar autenticador FIDO2 de teste compatível e demonstrar assinatura com UP/UV, PIN, revogação e duas pessoas físicas distintas.

## 2. Escopo e isolamento

A execução utilizou somente:

```text
OpenSSH_for_Windows_9.5p2 / LibreSSL 3.8.2
Git 2.54.0.windows.1
Node.js 24.19.0
diretório temporário local descartável
repositório Git local sem remote
```

Foram geradas apenas chaves Ed25519 sintéticas no diretório temporário. Nenhuma chave pessoal, corporativa ou de produção foi usada.

Não foram utilizados:

- banco de dados;
- GitHub remoto;
- Supabase, Render, Stripe ou outro serviço externo;
- schema Prisma ou migration;
- endpoint, frontend ou serviço da aplicação;
- bootstrap ou criação de OWNER;
- staging, commit, push ou deploy do projeto.

A única alteração persistente foi este relatório.

## 3. Evidências OpenSSH efetivamente testadas

### 3.1 Recursos disponíveis

| Verificação | Resultado |
|---|---|
| Versão | `OpenSSH_for_Windows_9.5p2, LibreSSL 3.8.2` |
| `ssh-keygen -Y sign/verify` | Disponível e exercitado |
| Tipo `ed25519-sk` | Reconhecido pela CLI |
| Opção `verify-required` | Reconhecida pela CLI |
| Helper de security key | `C:\Windows\System32\OpenSSH\ssh-sk-helper.exe` presente |
| Enrollment FIDO2 | Falhou; nenhuma chave criada |

A presença do algoritmo e do helper prova somente suporte compilado. Não prova compatibilidade com um autenticador específico nem user verification.

### 3.2 Prova com Ed25519 comum

O probe final executou 14 verificações e obteve **14/14 aprovações**:

1. geração de chave descartável A primária;
2. geração de chave descartável A de recuperação;
3. geração de chave descartável B;
4. assinatura de desafio canônico com namespace `bastidor-first-owner`;
5. verificação da assinatura pela chave pública cadastrada;
6. rejeição de conteúdo alterado;
7. rejeição de namespace divergente;
8. aceitação da primeira ocorrência do `evidenceHash`;
9. rejeição do replay do mesmo `evidenceHash`;
10. aceitação dentro da janela de cinco minutos;
11. rejeição após expiração;
12. mapeamento de duas chaves A para o mesmo `personId`;
13. rejeição da segunda chave A como pessoa aprovadora distinta;
14. aceitação da chave B como pessoa distinta e bloqueio da chave A após revogação no cadastro.

Fingerprint da chave primária descartável usada na execução final:

```text
SHA256:1PvORloryGnckCBFpi43upBve53ZDWXzLkJanLkscf4
```

O valor não pertence a chave operacional e foi descartado com o ambiente.

### 3.3 Replay, expiração e revogação

Replay e expiração não são propriedades automáticas da assinatura SSH. Foram implementados no probe como regras de aplicação:

- desafio com `nonce`, `issuedAt`, `expiresAt`, ação, ambiente, request ID e payload hash;
- `evidenceHash = SHA-256(assinatura || desafio)`;
- armazenamento do hash já consumido;
- rejeição da segunda tentativa;
- verificação explícita da janela temporal.

A revogação também é uma decisão de autorização. Depois de marcar a fingerprint como inativa, a assinatura antiga permaneceu criptograficamente válida, mas a ação foi recusada pelo cadastro. Esse comportamento é o esperado e confirma que toda ação deve revalidar o cadastro atual.

### 3.4 Tentativa FIDO2

Foi solicitado um enrollment descartável:

```text
ssh-keygen -t ed25519-sk -O verify-required ...
```

Saída relevante:

```text
Generating public/private ed25519-sk key pair.
You may need to touch your authenticator to authorize key generation.
Key enrollment failed: invalid format
```

O processo terminou com exit code 1 e não produziu chave FIDO2. A causa pode ser ausência/incompatibilidade de autenticador, provider do OpenSSH para Windows ou comportamento específico do dispositivo; sem hardware e telemetria adicional, não é correto atribuir uma causa única.

## 4. O que não foi comprovado na autenticação

Não foram comprovados:

- assinatura com chave `ed25519-sk` real;
- bit de user presence;
- bit de user verification;
- exigência de PIN pelo autenticador;
- contador/autenticador e comportamento contra clonagem;
- assinatura após remoção e reinserção do dispositivo;
- chave principal e chave de recuperação FIDO2 da mesma pessoa;
- duas pessoas físicas distintas operando dispositivos distintos;
- revogação de uma chave FIDO2 real;
- proteção do material privado por hardware;
- recuperação após perda do autenticador.

As chaves Ed25519 comuns do probe tinham ACL local limitada ao contexto do teste, administradores e sistema, mas o arquivo privado existia no disco. Isso não equivale à proteção de uma chave FIDO2 não exportável.

Portanto:

```text
assinatura OpenSSH comum: validada
políticas de replay/expiração: validadas em harness
mapeamento personId: validado em harness
FIDO2/UP/UV/MFA: não validado
```

## 5. Auditoria Git independente

### 5.1 Ambiente

Foi criado um repositório Git exclusivamente local, sem remote, dentro do diretório temporário. Ele recebeu dois commits sintéticos:

```text
e38eb84 anchor intent 9d2ed020-326e-4927-b104-8a75145ee902
8cdc461 anchor completion 9d2ed020-326e-4927-b104-8a75145ee902
```

Os hashes pertencem somente ao repositório descartável e não constituem evidência operacional permanente.

### 5.2 Resultado

O probe executou **10/10 verificações aprovadas**:

| Caso | Resultado |
|---|---|
| Cadeia de três eventos válida | Aprovado |
| Alteração no ator do evento intermediário | Detectada |
| Canonicalização determinística do recibo | Aprovada |
| Segunda exportação idêntica da intenção | Idempotente, sem novo commit |
| Alteração posterior do arquivo de intenção | Detectada contra o conteúdo commitado |
| Falha injetada antes do recibo de intenção | Falhou fechado; mutação simulada permaneceu falsa |
| Falha injetada no recibo final | Estado permaneceu `COMPLETED_PENDING_ANCHOR` |
| Retry do recibo final | Concluiu com sucesso |
| Segundo retry do recibo final | Idempotente, mesmo commit |
| Leitura do recibo final pelo Git | Hash idêntico ao esperado |

Hashes sintéticos principais:

```text
cabeça da cadeia inicial:
b7f467d773b237bfab5b9c666a7a004fcba58a9228112a79876a41a9aebe341c

recibo de intenção:
545836cc9d17190929410dbb10fea330d671720172b945505b164b359f2c3eae

recibo de conclusão:
20367e069f6ecb0bc0fbbfdc74772ffec5cd43936787c81d75a6d9ee79794356
```

### 5.3 Canonicalização e cadeia

O harness ordenou recursivamente as chaves JSON antes da serialização e calculou SHA-256 sobre bytes UTF-8 definidos. Cada evento incluiu:

```text
sequence
requestId
eventType
occurredAt
payloadHash
previousEventHash
metadata
```

O `eventHash` foi calculado sobre o evento sem o próprio hash. Modificar um evento que já fazia parte da cadeia invalidou sua hash e os vínculos posteriores.

### 5.4 Limites da prova Git

O teste demonstra consistência e detecção de adulteração quando existe uma referência confiável ao commit/hash. Ele não demonstra:

- proteção de branch GitHub;
- autenticação da workload remota;
- indisponibilidade de force-push para administradores;
- backup independente;
- retenção real;
- WORM;
- resistência a um invasor que consiga reescrever simultaneamente banco, repositório e referências externas.

O repositório local pode ser reescrito por quem controla o diretório. A prova valida o adapter e os contratos criptográficos, não imutabilidade externa real.

## 6. Revisão de segurança

### 6.1 Separação entre pessoas

O teste confirmou que separação por fingerprint seria insuficiente: duas chaves distintas foram mapeadas para `person-a`. A decisão deve usar `personId` canônico.

Política recomendada:

```text
requester.personId != approver.personId
executor.personId  != approver.personId em produção
```

Solicitante e executor podem ser a mesma pessoa sob a arquitetura aprovada; a segunda pessoa continua sendo o aprovador independente.

### 6.2 Cadastro e identidades duplicadas

O mecanismo técnico rejeita duas chaves do mesmo `personId`, mas não consegue provar que dois registros nominais correspondem à mesma pessoa real. Isso depende do enrollment:

- identificação presencial ou videoconferência controlada;
- registro nominal interno;
- duas pessoas revisando inclusão/alteração;
- proibição de autoenrollment;
- inventário das chaves físicas;
- auditoria de mudanças do cadastro.

Sem esse processo, uma pessoa poderia ser cadastrada fraudulentamente com dois `personId`.

### 6.3 Proteção das chaves privadas

Chaves Ed25519 em arquivo não satisfazem o requisito operacional. Para produção:

- usar autenticador FIDO2 compatível;
- exigir PIN e user verification;
- cadastrar chave principal e recuperação;
- guardar recuperação separadamente;
- nunca copiar private key/handle para repositório;
- revogar imediatamente dispositivos perdidos;
- revalidar cadastro em aprovação e execução.

### 6.4 Permissões mínimas da workload

Não houve banco nesta etapa, portanto as permissões não foram exercitadas. A role futura deve poder apenas:

- ler organização, usuário, membership, estabelecimento e OWNERs;
- inserir/atualizar operações dentro da máquina de estados;
- inserir eventos;
- criar exatamente `OrganizationAuthority` do tipo OWNER;
- usar o advisory lock.

Ela não deve possuir `CREATEDB`, `CREATEROLE`, bypass de RLS, alteração de schema, trigger, migration, outras tabelas ou revogação normal de OWNER.

A credencial deve ser curta e separada da identidade humana. A prova dessa role continua pendente de PostgreSQL local.

### 6.5 Banco errado

Não houve conexão de banco. Permanecem obrigatórios:

- fingerprint derivada de host lógico aprovado, database ID persistido e ambiente;
- ambiente incorporado ao desafio e ao recibo;
- confirmação literal pelo executor;
- allowlist de fingerprints, não apenas `DATABASE_URL`;
- recusa quando o ambiente declarado divergir do banco observado;
- ausência de credenciais de produção no shell comum.

Variável de ambiente ou nome do banco isoladamente não é prova suficiente.

### 6.6 Organização com OWNER existente

O comportamento foi apenas analisado, não executado. A transação deverá:

1. adquirir advisory lock da organização;
2. bloquear a operação;
3. consultar OWNER ativo dentro da mesma transação;
4. se existir, não criar nem adotar autoridade;
5. registrar `BOOTSTRAP_SUPERSEDED` e tornar a operação terminal.

Uma autoridade criada por fluxo normal nunca deve ser vinculada retroativamente à cerimônia.

### 6.7 Autoridade com ancoragem final pendente

O harness comprovou a máquina de estado em memória/Git:

```text
autoridade já criada
  -> falha de exportação final
  -> COMPLETED_PENDING_ANCHOR
  -> retry com mesmo recibo
  -> COMPLETED
```

Nesse estado:

- não se cria outra autoridade;
- `resume-anchor` não repete a mutação de domínio;
- a CLI retorna código de falha até concluir a ancoragem;
- monitoramento deve abrir incidente;
- operações OWNER normais podem ser mantidas bloqueadas até decisão operacional, exceto recuperação emergencial documentada;
- não se deve revogar automaticamente o único OWNER, pois isso pode bloquear a organização.

A atomicidade real entre criação da autoridade e operação ainda precisa ser provada no PostgreSQL descartável após a migration ser autorizada.

## 7. Ajustes recomendados à B2.18.8B

1. manter o **NO-GO automático** quando não for possível comprovar o bit UV;
2. adicionar ao contrato do serviço um resultado estruturado `userPresenceVerified` e `userVerificationVerified`, ambos obrigatórios em produção;
3. não depender apenas da saída textual de `ssh-keygen`; validar a estrutura da assinatura `sk` ou usar biblioteca/provider explicitamente autorizado;
4. adicionar `challengeId` único e persistir seu hash consumido, além de `evidenceHash`;
5. revalidar a versão e o hash do cadastro no momento da execução; qualquer mudança após aprovação invalida a aprovação;
6. versionar o algoritmo de canonicalização dos recibos (`canonicalizationVersion`);
7. normalizar timestamps em UTC, precisão definida, antes do hash;
8. separar `anchorState` do estado de domínio caso a implementação revele transições excessivamente acopladas;
9. impedir operação OWNER normal enquanto a primeira cerimônia estiver `COMPLETED_PENDING_ANCHOR`, salvo runbook emergencial aprovado;
10. implementar verificador offline que receba banco exportado e recibos sem precisar de credenciais de mutação;
11. testar a role mínima da workload em PostgreSQL antes de qualquer execução;
12. exigir duas pessoas físicas e pelo menos três chaves de teste no próximo gate: duas chaves da pessoa A e uma da pessoa B.

## 8. Próximo gate de hardware

Antes de schema/migration, executar uma B2.18.8C.1 com:

- dois autenticadores FIDO2 compatíveis ou três para cobrir recuperação;
- duas pessoas internas distintas;
- enrollment `ed25519-sk` com PIN/UV obrigatório;
- assinatura e verificação do desafio real;
- inspeção e validação dos flags UP/UV;
- assinatura rejeitada sem PIN/UV quando tecnicamente possível;
- chave revogada bloqueada embora a assinatura seja válida;
- duas chaves da pessoa A mapeadas ao mesmo `personId`;
- chave da pessoa B satisfazendo aprovação independente;
- teste em Windows/OpenSSH efetivamente escolhido para a operação.

Se o OpenSSH nativo continuar retornando `invalid format`, as alternativas são:

1. testar versão OpenSSH atualizada e compatível;
2. usar provider FIDO2 explicitamente suportado;
3. propor biblioteca WebAuthn/FIDO2 auditada, com nova dependência e autorização específica;
4. rever o mecanismo de identidade administrativa.

Não se deve degradar para Ed25519 em arquivo ou TOTP compartilhado.

## 9. Integridade do projeto

| Verificação | Resultado |
|---|---|
| Branch isolada | `integration/bastidor-permissions-b2` |
| HEAD | `251d45bee486fc1af41e6ba2cff5ccc896dafc56` |
| Migrations | 60; nenhuma criada ou alterada nesta etapa |
| Schema Prisma | Não alterado |
| Código funcional/testes/lockfiles | Não alterados |
| Staging | Vazio |
| PostgreSQL | Não iniciado nem acessado |
| Git remoto | Não acessado |
| OWNER/bootstrap | Não criado/executado |
| PROFILED | Não ativado |
| Serviços remotos | Não acessados |

## 10. GO/NO-GO

### GO parcial

- aceitar a viabilidade de `ssh-keygen -Y sign/verify` para desafios criptográficos;
- aceitar as políticas de replay, expiração, cadastro por `personId` e revogação como desenho implementável;
- aceitar o adapter Git local para recibos canônicos, idempotência e recuperação;
- manter os dois modelos propostos como desenho candidato.

### NO-GO para schema e migration 61

- FIDO2 real não foi enrolado;
- UP e UV não foram observados nem validados;
- MFA não foi comprovado;
- duas pessoas e chaves físicas distintas não foram exercitadas;
- role mínima, fingerprint de banco e concorrência real continuam sem teste por restrição de banco;
- proteção GitHub independente e WORM não foram configuradas nem testadas.

A implementação persistente deve permanecer bloqueada até a prova FIDO2 B2.18.8C.1 ou até aprovação explícita de outro mecanismo de identidade com garantias equivalentes.

B2.18.8C encerrada no limite autorizado. Nenhuma implementação da B2.18.8B foi iniciada.
