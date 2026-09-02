# Distributed Wagering Processor

Serviço financeiro que processa transações de apostas (`BET`, `WIN`, `LOSS`, `REFUND`, `ROLLBACK`) via HTTP e SQS. O PostgreSQL é a fonte da verdade: idempotência, saldo, ledger, inbox e outbox.

Stack: **Bun**, **TypeScript**, **NestJS**, **MikroORM**, **PostgreSQL**, **SQS** (LocalStack).

## Pré-requisitos

- [Bun 1.x](https://bun.sh)
- Docker e Docker Compose

## Setup

### Docker completo (recomendado)

Sobe PostgreSQL, LocalStack, pgAdmin e a aplicação. As migrations são aplicadas automaticamente pelo serviço `migrate` antes do `app` iniciar.

```bash
bun install
docker compose up
```

A aplicação fica disponível na porta `3000`. Defaults de desenvolvimento: usuário/senha `postgres`, banco `wagering`, LocalStack em `http://localhost:4566`.

### Desenvolvimento no host

Para rodar a aplicação localmente com hot reload nativo (fora do container):

```bash
bun install
docker compose up postgres localstack -d
bunx mikro-orm migration:up
bun run start:dev
```

Atalho para aplicar migrations sem subir o `app`:

```bash
docker compose run --rm migrate
```

## Comandos

```bash
bun run start:dev          # API + workers (watch) — fluxo host
bun run start              # API + workers
bun run start:prod         # bun dist/main (após bun run build)
bunx mikro-orm migration:up  # necessário no fluxo host ou após novas migrations
bun run lint
```

## Testes

PostgreSQL e LocalStack precisam estar no ar para integração e concorrência. O setup de teste cria o banco `wagering_test`, aplica migrations e limpa as tabelas entre os casos.

```bash
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

Todo teste de integração/concorrência confere `wallet.balance == saldo reconstruído pelo ledger`.

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

Decisões, status HTTP, códigos de falha e trade-offs: [ARCHITECTURE.md](./ARCHITECTURE.md).
