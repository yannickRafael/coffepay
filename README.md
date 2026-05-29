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

## Stack

Node 20 · TypeScript · Express · Prisma + PostgreSQL · Redis + BullMQ · JWT · Zod ·
Jest + Supertest · Docker Compose.

## Estado

Em desenvolvimento. Ver o board Kanban do projecto para tarefas e fases.
