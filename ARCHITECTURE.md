# Arquitetura

Monólito modular. O domínio não depende de NestJS, MikroORM nem SQS.

```
HTTP / SQS
    → use cases (orquestração)
        → entidades de domínio
            → PostgreSQL (mesma transação SQL)
                → outbox → SQS (depois do commit)
```

| Camada | Responsabilidade |
|---|---|
| `src/domain` | `Money`, `Wallet`, `WagerTransaction`, ledger, inbox/outbox, eventos |
| `src/application` | Use cases e portas |
| `src/infrastructure` | HTTP, MikroORM, SQS, health, logs, métricas |

HTTP e o consumidor SQS chamam o mesmo use case de processamento.

## Autenticação

Não implementada. Autenticação não pontua no desafio; o tempo foi para correção financeira, concorrência e idempotência.

Desenho que seria adotado:

- Identity Provider externo (Keycloak / OIDC), sem tabela própria de usuários.
- Guard NestJS nas rotas HTTP validando JWT. Health e métricas ficam abertos.
- SQS é canal interno confiável. A identidade do provedor no payload continua sujeita às regras de domínio.

## Persistência

**MikroORM** — Unit of Work e `LockMode` explícitos, alinhados ao desafio.

**Money:** `big.js` no domínio (nunca `number`). Na persistência, valor e moeda em colunas separadas (`numeric(18,2)` + ISO-4217). Reidratação via `Money.from`. Serialização sempre com 2 casas.

**Transação:** `EntityManager.transactional()`. Wallet, ledger, transação, inbox (entrada SQS) e outbox entram no mesmo commit. Eventos só são publicados depois.

Constraints no schema (não só no código):

- uma wallet por `(player_id, currency)`
- saldo e valores monetários `>= 0`
- unicidade de `(provider_id, idempotency_key)` e `(provider_id, external_transaction_id)`
- no máximo um lançamento por `(wallet_id, transaction_id)`
- inbox por `(message_id, consumer_name)`

## Concorrência

Unidade de concorrência: `walletId`.

`SELECT FOR UPDATE` na wallet (`LockMode.PESSIMISTIC_WRITE`) serializa operações da mesma wallet. Wallets distintas seguem em paralelo. Sem lock global.

`version` incrementa só quando o saldo muda (invariante de domínio). Não é o mecanismo de lock — o lock pessimista evita lost update sem retry de write conflict.

Outbox e `PENDING_REFERENCE` usam `SELECT FOR UPDATE SKIP LOCKED` para várias instâncias reclamarem linhas diferentes.

## Transições de `WagerTransaction`

`create` nasce em `PENDING`. `OPENING` não entra por API/SQS (`createOpening` só no use case de wallet).

```
PENDING ──► PROCESSED
PENDING ──► PENDING_REFERENCE ──► PROCESSED
                          └──► PENDING_REFERENCE (retry)
                          └──► REJECTED
PENDING ──► REJECTED
qualquer não-terminal ──► FAILED
```

`PROCESSED`, `REJECTED` e `FAILED` são terminais. Nova transição lança erro de programação.

## Interpretações além do enunciado

- `WIN` pode omitir referência e ser processado na hora. Se trouxer `referenceExternalTransactionId` ausente, vai para `PENDING_REFERENCE`.
- `WIN` com referência deve apontar para uma `BET` `PROCESSED` do mesmo escopo (provider, player, wallet, moeda, rodada). O montante do `WIN` não precisa ser igual ao da `BET`.
- Uma transação referenciada aceita no máximo uma reversão `PROCESSED` (`REFUND` ou `ROLLBACK`), não uma de cada tipo.
- Replay idempotente devolve o saldo observado na aplicação original (`observedBalance`).
- Moeda única na prática (`BRL`); o modelo continua multi-moeda e rejeita conflito de moeda.

## Códigos de falha

| Código | Quando | Provedor |
|---|---|---|
| `INSUFFICIENT_BALANCE` | `BET` sem saldo | não reenviar o mesmo valor |
| `REVERSAL_WOULD_NEGATE_BALANCE` | `ROLLBACK` deixaria saldo negativo | distinto de aposta sem saldo |
| `CURRENCY_MISMATCH` | moeda ≠ wallet | corrigir payload |
| `REFERENCE_NOT_FOUND` | referência não apareceu após o limite | desistir ou reenviar a referência |
| `INVALID_REFERENCE` | tipo, rodada, valor ou escopo inválidos | corrigir payload |
| `REVERSAL_ALREADY_APPLIED` | reversão já processada | não reenviar |
| `PAYLOAD_CONFLICT` | mesma idempotency key, payload diferente | não é replay |
| `INVALID_TRANSACTION_STATE` | transição sobre estado terminal | bug, não reenviar |

## Idempotência e hash

Fonte da verdade: header `Idempotency-Key`.

`payloadHash` = SHA-256 de JSON canônico (chaves ordenadas) de:

`providerId`, `externalTransactionId`, `playerId`, `walletId`, `roundId`, `gameId`, `kind`, `money`, `referenceExternalTransactionId` (se houver).

Header e metadados de transporte ficam de fora. Mesma key + mesmo hash → replay. Mesma key + hash diferente → `409`.

## Status HTTP

Situações distintas não compartilham o mesmo código.

| Situação | Status |
|---|---|
| Payload / header inválido | `400` |
| Wallet / transação inexistente | `404` |
| Wallet duplicada ou conflito de idempotência | `409` |
| Rejeição de negócio (`REJECTED`) | `422` |
| `PENDING` / `PENDING_REFERENCE` | `202` |
| `PROCESSED` primeira vez | `201` |
| Replay idempotente | `200` |
| Infra transitória | `503` |

O body de `POST /wagering/transactions` segue o contrato do desafio (`transactionId`, `status`, `balance`, `idempotentReplay`). `failureCode` está no `GET` da transação.

## Mensageria

Filas FIFO: `wager-transactions` + DLQ, `outbox-events` + DLQ. FIFO é otimização; invariantes ficam no banco.

Consumidor:

- inbox persistente `(consumerName, messageId)`
- mesmo use case da API
- ack só depois do commit
- rejeição de negócio → ack
- erro transitório → sem ack (retry SQS)
- `maxReceiveCount = 5` → DLQ
- conflito de payload da inbox → DLQ
- `SIGTERM` espera o poll em andamento

Fronteira transacional por entry point:

- **HTTP** → `execute()` abre a transação (fast-path de idempotência fora dela).
- **Consumer SQS** → infra abre a transação (inbox + processamento + outbox no mesmo commit); chama `executeWithinTransaction()`.
- **Pending-reference worker** → infra abre a transação; chama `reprocessPendingReferenceWithinTransaction()`.

Transações aninhadas (savepoints do MikroORM) foram evitadas de propósito: uma transação plana é mais fácil de auditar e alinha com a atomicidade exigida entre inbox, ledger e outbox.

Outbox: gravada no commit financeiro. Worker publica depois, com backoff `5s * 2^(attempts-1)` limitado a 5 min. Publicação duplicada é segura para o consumidor (at-least-once).

## `PENDING_REFERENCE`

Worker com backoff `5s * 2^attempts`, teto de 5 min, **20 tentativas** (`PENDING_REFERENCE_MAX_ATTEMPTS`).

Cabe atraso de mensagem fora de ordem sem esperar para sempre. Esgotado o limite: `REJECTED` + `REFERENCE_NOT_FOUND` e evento correspondente.

## Status `FAILED`

`FAILED` é terminal e auditável, reservado para falhas permanentes de infraestrutura — distinto de `REJECTED` (regra de negócio) e `PENDING_REFERENCE` (aguardando referência).

O consumidor SQS detecta quando uma mensagem atingiu `SQS_MAX_RECEIVE_COUNT` (padrão 5, configurável) e tenta, em transação separada (best-effort), chamar `failTransactionIfExistsWithinTransaction`. Isso transiciona a `WagerTransaction` existente no banco para `FAILED` com `failureCode = INFRASTRUCTURE_ERROR` antes de o SQS movê-la para a DLQ.

**Limitação conhecida:** se o erro ocorreu antes do primeiro commit (a transação nunca chegou a ser persistida), não existe registro para marcar. Nesses casos, o DLQ serve como evidência da falha e a `WagerTransaction` simplesmente não existe no banco. Essa limitação é intrínseca ao modelo at-least-once com commit atômico e não tem solução sem two-phase commit ou saga compensatória.

## Observabilidade

Logs JSON com `correlationId`, `messageId`, `transactionId`, `walletId`, `providerId`. Sem payload financeiro completo.

Métricas em `GET /metrics`: transações por status, duplicatas, retries, DLQ, conflitos de lock, lag da outbox, latência.

`GET /health/live` (processo) e `GET /health/ready` (PostgreSQL + SQS), sem autenticação.

Reconciliação não corrige divergência: devolve `consistent` e a diferença.

## Trade-offs e limitações

- Lock pessimista por wallet: correto em hot wallet, serializa essa wallet. Optimistic lock com retry evitaria espera, mas exigiria mais reprocessamento.
- `version` não participa do `UPDATE`. Suffice o `FOR UPDATE`.
- Ledger pagina em memória depois de carregar todos os lançamentos da wallet.
- Submit `422` não inclui `failureCode` no body (está no GET).
- Sem Auth/IdP (ver seção de autenticação).
- Sem OpenTelemetry.
- `FAILED` existe no modelo; o caminho operacional atual rejeita regra de negócio ou reentrega erro de infra.
