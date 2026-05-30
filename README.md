# CoffePay

Gateway de interoperabilidade que liga carteiras móveis moçambicanas (M-Pesa) a
ecossistemas de pagamento internacionais, dispensando cartão bancário.

Projecto Final de Curso — ISUTC, Engenharia e Ciência dos Computadores.
Autor: Yannick Rafael Alberto Matimbe.

## Arquitectura

Monorepo (npm workspaces) com microserviços:

| Serviço                | Função                                                          |
| ---------------------- | --------------------------------------------------------------- |
| `api-gateway`          | Ponto de entrada: auth, rate-limiting, routing, TLS termination |
| `session-service`      | Cria e gere sessões de pagamento; conversão cambial via FX      |
| `payment-service`      | Checkout, idempotência, iniciação de pagamento via M-Pesa       |
| `callback-service`     | Processa resultado do M-Pesa, ledger e auditoria                |
| `kyc-service`          | Validação KYC/AML (activa e passiva)                            |
| `fx-service`           | Conversão cambial MZN↔USD em tempo real                         |
| `notification-service` | Webhooks assinados para o merchant, retry e DLQ                 |

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

Node 20 · TypeScript · Express · Prisma + PostgreSQL · Redis + BullMQ · JWT · Zod ·
Jest + Supertest · Docker Compose.

## Como correr (desenvolvimento)

Pré-requisitos: Node ≥ 20, Docker + Docker Compose.

```bash
# 1. Instalar dependências (gera o Prisma Client)
npm install

# 2. Variáveis de ambiente
cp .env.example .env            # ajustar se necessário

# 3. Infra local (PostgreSQL 16 + Redis 7)
docker compose -f ops/docker-compose.yml up -d

# 4. Base de dados
npm run db:migrate              # aplica migrações
npm run db:seed                 # merchant + apiKey + webhook de teste

# 5. Verificações
npm run typecheck && npm run lint && npm run test

# 6. Arrancar um serviço (exemplo)
npm run dev -w @coffepay/api-gateway
```

Scripts úteis na raiz: `build`, `test`, `lint`, `format`, `typecheck`,
`db:migrate`, `db:seed`, `db:reset`, `db:studio`. Detalhe da infra em
[`ops/README.md`](ops/README.md).

## Estado

Em desenvolvimento (cronograma de 18 dias). Tarefas, prioridades e fases no
[board Kanban](https://github.com/users/yannickRafael/projects/4) do projecto;
cada commit fecha a issue correspondente (`Closes #N`).
