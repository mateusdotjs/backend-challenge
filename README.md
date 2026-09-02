# Distributed Wagering Processor

Serviço financeiro que processa transações de apostas (`BET`, `WIN`, `LOSS`, `REFUND`, `ROLLBACK`) via HTTP e SQS. O PostgreSQL é a fonte da verdade: idempotência, saldo, ledger, inbox e outbox vivem no banco — não em cache nem no broker.

Stack: **Bun**, **TypeScript**, **NestJS**, **MikroORM**, **PostgreSQL**, **SQS** (LocalStack).

Cada processo da aplicação sobe **API HTTP + três workers** no mesmo binário (consumidor SQS, publicador de outbox, reprocessador de referências pendentes). Detalhes de arquitetura e decisões: [ARCHITECTURE.md](./ARCHITECTURE.md).

## O que está implementado

- Domínio financeiro: `Money`, `Wallet`, `WagerTransaction`, ledger imutável, inbox/outbox
- API HTTP completa (ver tabela abaixo)
- Mensageria SQS: inbox persistente, outbox transacional, DLQ, worker de `PENDING_REFERENCE`
- Idempotência persistente (`Idempotency-Key` + `payloadHash` canônico)
- Concorrência por wallet (`SELECT FOR UPDATE`); suporte a múltiplas instâncias
- Constraints no schema PostgreSQL (unicidade, saldo não negativo, um ledger por transação)
- Health (`/health/live`, `/health/ready`), métricas Prometheus (`/metrics`), logs JSON estruturados
- Migrations versionadas (MikroORM)
- Docker Compose com serviço `migrate` one-shot antes do `app`

## O que não está implementado (e por quê)

| Item | Motivo |
|---|---|
| Autenticação / IdP (Keycloak, OIDC) | Não pontua na avaliação do desafio; tempo investido em correção financeira, concorrência e idempotência. Desenho e ponto de extensão em [ARCHITECTURE.md](./ARCHITECTURE.md). |
| OpenTelemetry / dashboard | Opcional no enunciado |
| Teste de carga (`test:load`) | Diferencial não implementado |
| Paginação server-side do ledger | Cursor opaco existe na API; o use case carrega todos os lançamentos e fatia em memória (trade-off consciente) |
| Microserviços | Fora do escopo — monólito modular |

## Pré-requisitos

| Ferramenta | Quando precisa |
|---|---|
| Docker e Docker Compose | Sempre (banco, filas SQS, ou app containerizada) |
| [Bun 1.x](https://bun.sh) | App no host, testes ou lint — **não** é necessário só para subir via Docker |

## Como rodar

Escolha **um** fluxo. Não misture: se o serviço `app` do compose estiver no ar, não rode `bun run start:dev` no host na mesma porta (conflito em `:3000` e dois consumers SQS).

### Opção 1 — Tudo no Docker (recomendado para avaliar)

Só precisa de Docker. Dependências são instaladas na build da imagem — **não** rode `bun install` no host.

```bash
docker compose up --build
```

Na primeira execução, `--build` garante a imagem com `bun install`. Depois, `docker compose up` basta.

O que sobe, nesta ordem:

1. **postgres** — aguarda healthcheck
2. **localstack** — cria filas SQS via [`localstack/init-queues.sh`](localstack/init-queues.sh)
3. **migrate** — one-shot: `bunx mikro-orm migration:up` (encerra ao concluir)
4. **app** — API + workers em http://localhost:3000 (`start:dev` dentro do container, com hot reload via volume mount)
5. **pgadmin** (opcional) — http://localhost:5050

Defaults: usuário/senha `postgres`, banco `wagering`, LocalStack em http://localhost:4566.

### Opção 2 — Infra no Docker, app no host (desenvolvimento)

Precisa de Bun no host. Sobe **apenas** postgres e localstack — **não** inclua o serviço `app`.

```bash
bun install
docker compose up postgres localstack -d
docker compose run --rm migrate
bun run start:dev
```

Alternativa à migration: `bunx mikro-orm migration:up` no host (com `DB_HOST=localhost`).

No host, endpoints de infra usam `localhost` (não `localstack`):

- `DB_HOST=localhost`
- `AWS_ENDPOINT_URL=http://localhost:4566`

### Verificar que está funcionando

```bash
curl -s http://localhost:3000/health/ready | jq

curl -s -X POST http://localhost:3000/wallets \
  -H 'Content-Type: application/json' \
  -d '{"playerId":"0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1","initialBalance":{"amount":"100.00","currency":"BRL"}}' | jq

# substituir WALLET_ID pelo id retornado
curl -s -X POST http://localhost:3000/wagering/transactions \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: provider-a:bet-1' \
  -d '{"providerId":"provider-a","externalTransactionId":"bet-1","playerId":"0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1","walletId":"WALLET_ID","roundId":"round-1","gameId":"game-1","kind":"BET","money":{"amount":"10.00","currency":"BRL"}}' | jq
```

## Serviços e portas

| Serviço | Porta | Notas |
|---|---|---|
| API | 3000 | http://localhost:3000 |
| PostgreSQL | 5432 | user/pass `postgres`, db `wagering` |
| LocalStack (SQS) | 4566 | http://localhost:4566 |
| pgAdmin | 5050 | admin@admin.com / admin |

Filas FIFO criadas no LocalStack:

- `wager-transactions.fifo` / `wager-transactions-dlq.fifo`
- `outbox-events.fifo` / `outbox-events-dlq.fifo`

## Comandos

```bash
bun run start:dev          # API + workers (watch) — fluxo host
bun run start              # API + workers
bun run start:prod         # bun dist/main (após bun run build)
bunx mikro-orm migration:up
bun run lint
```

## Múltiplas instâncias

O `docker compose up` padrão sobe **uma instância** do `app` mapeada em `:3000`.

A solução foi desenhada para **N instâncias** competindo pelo mesmo PostgreSQL e SQS. Cada instância executa API + os três workers — não há modo worker-only separado.

Por que múltiplas instâncias são seguras:

- **Wallet:** `SELECT FOR UPDATE` serializa operações da mesma wallet
- **Outbox e pending-reference:** `SELECT FOR UPDATE SKIP LOCKED` distribui linhas entre instâncias
- **Inbox SQS:** deduplicação persistente por `(consumerName, messageId)`

### Rodar 3 instâncias localmente (host)

Use a **Opção 2** (infra Docker, app no host). Não suba o serviço `app` do compose.

```bash
bun install
docker compose up postgres localstack -d
docker compose run --rm migrate

# terminal 1
PORT=3000 bun run start:dev

# terminal 2
PORT=3001 bun run start:dev

# terminal 3
PORT=3002 bun run start:dev
```

Qualquer instância pode receber HTTP. O consumidor SQS divide mensagens entre as instâncias que estão fazendo poll na mesma fila.

Os **testes de concorrência** simulam três apps Nest em processo com `enableWorkers: false` (só HTTP, sem poll SQS) — ver [`test/concurrency/idempotent-and-hot-wallet.spec.ts`](test/concurrency/idempotent-and-hot-wallet.spec.ts).

## Variáveis de ambiente

| Variável | Default (compose) | Uso |
|---|---|---|
| `PORT` | `3000` | porta HTTP |
| `DB_HOST` | `postgres` / `localhost` (host) | PostgreSQL |
| `DB_PORT` | `5432` | PostgreSQL |
| `DB_NAME` | `wagering` | banco |
| `DB_USER` / `DB_PASSWORD` | `postgres` | credenciais |
| `AWS_REGION` | `us-east-1` | SQS |
| `AWS_ENDPOINT_URL` | `http://localstack:4566` | endpoint SQS (LocalStack) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `test` | credenciais LocalStack |
| `SQS_WAGER_TRANSACTIONS_QUEUE_URL` | fila FIFO de entrada | consumidor |
| `SQS_WAGER_TRANSACTIONS_DLQ_URL` | DLQ de entrada | roteamento manual |
| `SQS_OUTBOX_EVENTS_QUEUE_URL` | fila de eventos | publicador outbox |
| `SQS_OUTBOX_EVENTS_DLQ_URL` | DLQ de eventos | — |
| `OUTBOX_POLL_INTERVAL_MS` | `1000` | intervalo entre polls do outbox |
| `OUTBOX_BATCH_SIZE` | `10` | batch do outbox |
| `PENDING_REFERENCE_POLL_INTERVAL_MS` | `5000` | intervalo do worker de referência |
| `PENDING_REFERENCE_BATCH_SIZE` | `10` | batch pending-reference |
| `PENDING_REFERENCE_MAX_ATTEMPTS` | `20` | tentativas antes de `REFERENCE_NOT_FOUND` |
| `SQS_MAX_RECEIVE_COUNT` | `5` | alinhado ao `maxReceiveCount` do LocalStack |

## Testes

Precisa de Bun no host. PostgreSQL e LocalStack devem estar no ar (Opção 2: `docker compose up postgres localstack -d`).

```bash
bun install                # se ainda não instalou dependências no host
bun run test:unit          # domínio e use cases
bun run test:integration   # PostgreSQL + LocalStack
bun run test:concurrency   # races reais, multi-instância em processo
bun run test:all
bun run test:cov
```

| Pasta | Escopo |
|---|---|
| `src/**/*.spec.ts` | Unidade |
| `test/integration/` | Migrations, API, inbox/outbox, DLQ, observabilidade |
| `test/concurrency/` | Hot wallet, idempotência paralela, recovery |

Todo teste de integração/concorrência confere `wallet.balance == saldo reconstruído pelo ledger`. O setup de teste cria o banco `wagering_test`, aplica migrations e limpa tabelas entre casos.

## API

| Método | Rota |
|---|---|
| `POST` | `/wallets` |
| `GET` | `/wallets/:walletId` |
| `GET` | `/wallets/:walletId/ledger?cursor=&limit=50` |
| `POST` | `/wallets/:walletId/reconciliation` |
| `POST` | `/wagering/transactions` (`Idempotency-Key` obrigatório) |
| `GET` | `/wagering/transactions/:transactionId` |
| `GET` | `/providers/:providerId/wagering/transactions/:externalTransactionId` |
| `GET` | `/health/live` |
| `GET` | `/health/ready` |
| `GET` | `/metrics` |

Status HTTP, códigos de falha, fluxos SQS e trade-offs: [ARCHITECTURE.md](./ARCHITECTURE.md).
