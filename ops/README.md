# Ops — Infra local

Infra de desenvolvimento do CoffePay: PostgreSQL 16 e Redis 7 via Docker Compose.

## Pré-requisitos

- Docker + Docker Compose v2
- Copiar `.env.example` da raiz para `.env` e ajustar se necessário

## Subir / parar

```bash
# a partir da raiz do repo
docker compose -f ops/docker-compose.yml up -d        # arranca postgres + redis
docker compose -f ops/docker-compose.yml ps           # estado + healthcheck
docker compose -f ops/docker-compose.yml logs -f      # logs
docker compose -f ops/docker-compose.yml down         # parar (mantém dados)
docker compose -f ops/docker-compose.yml down -v      # parar + apagar volumes
```

## Verificar

```bash
# Postgres
docker exec coffepay-postgres pg_isready -U coffepay -d coffepay

# Redis
docker exec coffepay-redis redis-cli ping   # -> PONG
```

## Webhooks via ngrok (T28)

O CoffePay entrega webhooks assinados (HMAC) ao `url` do merchant. Para o
`mockstore` os receber a partir de uma máquina local, expõe-no com ngrok e
regista esse URL público como webhook do merchant demo.

```bash
# 1. Arranca o mockstore (porta 4000 por omissão)
npm run dev -w @coffepay/mockstore

# 2. Expõe a porta com ngrok
ngrok http 4000                       # devolve um URL https://<id>.ngrok-free.app

# 3. Regista o URL público como webhook do merchant demo
#    receptor: POST <url>/webhooks/coffepay  (verifica X-CoffePay-Signature)
```

- O segredo HMAC partilhado vem de `WEBHOOK_SIGNING_SECRET` (raiz) — o mockstore
  lê `MOCKSTORE_WEBHOOK_SECRET` ou, em alternativa, `WEBHOOK_SIGNING_SECRET`.
- Assinatura inválida → 401 (o emissor faz retry → DLQ, T25).
- O cliente regressa a `GET <url>/return?session=&status=` (T26); a página de
  confirmação usa o resultado do webhook se já tiver chegado.

## Simular falha de conectividade (T33)

Em modo mock, é possível simular o Vodacom OpenAPI indisponível para demonstrar
que os pagamentos ficam retidos na fila e retomam quando o provider volta (RNF04),
sem débito duplo (RNF05).

- **Por ambiente** (estático): `MPESA_SIMULATE_OUTAGE=true` no `.env` → o cliente
  M-Pesa lança erro de rede transitório; os jobs re-tentam (BullMQ backoff) e a
  sessão fica `PROCESSING`. Voltar a `false` (e reiniciar) → o próximo job sucede.
- **Em runtime** (demo/teste): `setSimulatedOutage(true)` / `clearSimulatedOutage()`
  de `@coffepay/shared` ligam/desligam a falha dentro do mesmo processo.
- Se a falha durar além de `PAYMENT_TIMEOUT_MS`, o sweeper (RF08, T22) marca a
  sessão `FAILED` — comportamento esperado.

Provado automaticamente em `services/payment-service/src/payment.worker.test.ts`
(hold→resume sem débito duplo) e `packages/shared/src/mpesa/outage.test.ts`.

## Inspecionar / reprocessar a DLQ (T34)

Jobs que esgotam as tentativas são movidos para uma DLQ (`payment-process-dlq`,
`merchant-notify-dlq`). O api-gateway expõe endpoints admin (protegidos por
`X-Admin-Key` = `ADMIN_API_KEY`; sem chave configurada, ficam fechados):

```bash
# Listar dead letters (paginado: ?start=&end=)
curl -H "X-Admin-Key: $ADMIN_API_KEY" \
  http://localhost:3000/admin/dlq/payment-process-dlq

# Reprocessar uma (re-enfileira na fila de origem, remove da DLQ, audita DLQ_REPROCESSED)
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" \
  http://localhost:3000/admin/dlq/payment-process-dlq/<id>/reprocess
```

Reprocessar é seguro repetir: a idempotência (RNF05/T32) evita débito ou
notificação duplicados.

## Notas

- Dados persistem em volumes nomeados (`postgres-data`, `redis-data`).
- Portas configuráveis via `POSTGRES_PORT` / `REDIS_PORT` no `.env`.
- Os microserviços e o `mockstore` correm localmente (`npm run dev`) contra esta
  infra. O wiring completo de todos os serviços no compose (+ ngrok) é feito no T35.
