# CoffePay

Gateway de interoperabilidade que liga carteiras móveis moçambicanas (M-Pesa) a
ecossistemas de pagamento internacionais, dispensando cartão bancário.

Projecto Final de Curso — ISUTC, Engenharia e Ciência dos Computadores.
Autor: Yannick Rafael Alberto Matimbe.

## Arquitectura

Monorepo (npm workspaces) com microserviços:

| Serviço                | Função                                                                 |
| ---------------------- | ---------------------------------------------------------------------- |
| `api-gateway`          | Ponto de entrada: auth (API key→JWT), rate-limiting, routing, `/docs`  |
| `session-service`      | Sessões, FX, checkout (HTML), validação, `/pay` (idempotência), expiry |
| `payment-service`      | Worker da fila: corre o C2B M-Pesa e delega o resultado ao handler     |
| `callback-service`     | Recebe o callback do M-Pesa e processa o resultado (ledger, auditoria) |
| `kyc-service`          | Validação KYC/AML (activa e passiva)                                   |
| `fx-service`           | Conversão cambial USD→MZN com spread, cache em Redis                   |
| `notification-service` | Worker: webhooks assinados (HMAC) para o merchant, retry e DLQ         |

Pastas adicionais:

- `mockstore/` — loja simulada (plataforma de destino) para validação.
- `packages/shared/` — libs comuns: cliente M-Pesa, crypto/HMAC, FX, Prisma, erros.
- `docs/` — documentação, ADRs, especificação da API.
- `ops/` — docker-compose, configuração de ambiente, CI.

Detalhe completo em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Decisões
arquitecturais em [`docs/adr/`](docs/adr) — ver
[ADR-001](docs/adr/ADR-001-vodacom-openapi-sync-async.md) (adaptação síncrono→assíncrono
da OpenAPI da Vodacom).

## Stack

Node 22 · TypeScript · Express · Prisma + PostgreSQL 16 · Redis 7 + BullMQ · JWT · Zod ·
HMAC · Jest + Supertest · Docker Compose. M-Pesa em modo mock quando sem credenciais.

## Correr o stack completo (demo)

A forma mais rápida de ver tudo a funcionar — uma imagem constrói o monorepo e o
compose levanta os 7 serviços + mockstore + datastores (T35):

```bash
cp .env.example .env
docker compose -f ops/docker-compose.yml up --build -d
```

O serviço `migrate` aplica migrações e seed (merchant demo + API key
`cp_dev_sk_demo_0001`). Depois:

- Loja demo: <http://localhost:4000> → "Pay with CoffePay" → checkout → resultado.
- API docs (Swagger): <http://localhost:3000/docs>.

Detalhe (ngrok, DLQ, simulação de falha) em [`ops/README.md`](ops/README.md).

## Correr em desenvolvimento

Pré-requisitos: Node ≥ 22, Docker + Docker Compose.

```bash
# 1. Dependências (gera o Prisma Client)
npm install

# 2. Variáveis de ambiente (ver .env.example para todas as chaves)
cp .env.example .env

# 3. Só os datastores (PostgreSQL 16 + Redis 7)
docker compose -f ops/docker-compose.yml up -d postgres redis

# 4. Base de dados
npm run db:migrate              # aplica migrações
npm run db:seed                 # merchant + apiKey + webhook de teste

# 5. Verificações
npm run typecheck && npm run lint && npm run test

# 6. Arrancar um serviço (exemplo)
npm run dev -w @coffepay/api-gateway
```

Scripts úteis na raiz: `build`, `test`, `lint`, `format`, `typecheck`,
`db:migrate`, `db:seed`, `db:reset`, `db:studio`. Variáveis de ambiente
documentadas em [`.env.example`](.env.example); detalhe da infra em
[`ops/README.md`](ops/README.md).

## Estado

Implementação funcional ponta-a-ponta: criação de sessão, checkout, KYC, C2B
(mock/real), ledger de dupla entrada, notificação por webhook assinado com
retry/DLQ, resiliência (circuit breaker, retry, idempotência) e auditoria.
Tarefas, prioridades e fases no
[board Kanban](https://github.com/users/yannickRafael/projects/4); cada commit
fecha a issue correspondente (`Closes #N`).
