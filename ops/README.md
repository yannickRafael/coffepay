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

## Notas

- Dados persistem em volumes nomeados (`postgres-data`, `redis-data`).
- Portas configuráveis via `POSTGRES_PORT` / `REDIS_PORT` no `.env`.
- Os microserviços e o `mockstore` correm localmente (`npm run dev`) contra esta
  infra. O wiring completo de todos os serviços no compose (+ ngrok) é feito no T35.
