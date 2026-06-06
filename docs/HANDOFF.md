# CoffePay — Handoff / Estado do Projeto

> Documento de continuidade. Última atualização: T25 concluído (31/49 issues, 63%).

## 1. O que é

CoffePay = gateway de interoperabilidade que liga carteiras móveis moçambicanas
(M-Pesa, caso de estudo Vodacom Moçambique OpenAPI) a ecossistemas de pagamento
internacionais, **sem cartão bancário**. Projeto de Fim de Curso (PFC) do
yannickRafael. A tese fonte: `docs/YannickMatimbe-PFC2026-MAIN.pdf`.

Fluxo: loja online (merchant) → "Pay with CoffePay" → cria sessão (USD→MZN via FX)
→ checkout (cliente mete nº M-Pesa) → KYC/AML → débito C2B M-Pesa → notifica merchant
(webhook assinado) → redirect do cliente.

## 2. Decisões trancadas

- **M-Pesa API**: Vodacom Moçambique **OpenAPI** (não Daraja).
- **ADR-001** (`docs/adr/`): Vodacom C2B é **síncrono** (request-response, PIN no
  device), NÃO o STK-Push+callback assíncrono da tese. Adaptação: orquestração
  assíncrona interna via BullMQ; merchant notificado por webhook assinado.
- **Monorepo** npm workspaces. **Repo público**: github.com/yannickRafael/coffepay.
- **Stack**: Node 22, TypeScript (NodeNext, strict), Express, Prisma + PostgreSQL 16,
  Redis 7 + BullMQ (filas+DLQ), JWT, Zod, bcrypt, helmet, crypto HMAC, Jest+Supertest,
  Docker Compose. Mock-mode M-Pesa quando sem credenciais.

## 3. Regras de trabalho (IMPORTANTE — memória do utilizador)

- **Commits diretos na `main`** — solo, SEM branches, SEM PRs. `git push origin main`.
- **Autor só `yannickRafael <yannickrafael286@gmail.com>`** — NUNCA co-autor Claude/AI
  até o utilizador autorizar. Commit com `git -c user.name=... -c user.email=...`.
- **Mensagens de commit**: texto simples, SEM markdown (sem backticks/#/bullets).
- **Descrição detalhada de cada issue ANTES de a implementar** (`gh issue edit
N --body-file`). Formato: Objetivo / Contexto / Escopo / Fora-escopo / Acceptance-DoD
  / Refs. Fase 1 e Fase 3 inteiras já detalhadas; Fase 4/5 detalhar just-in-time.
- **Testes distribuídos por serviço** (não no fim).
- Responder em **caveman mode** (hook ativo); código/commits normais.
- Issue fecha-se via `Closes #N` no commit (auto-close no push à main). API GitHub às
  vezes tem lag/blips — re-verificar com `gh issue view N --json state`.

## 4. Estrutura

```
coffepay/
  packages/shared/        @coffepay/shared — núcleo partilhado
    prisma/schema.prisma  13 modelos + 5 enums (fonte única da BD)
    src/ logger, errors, config(zod env), redis, db(prisma singleton),
         phone(MSISDN MZ), crypto/{hmac,password}, mpesa/{client,session,...},
         queue/{queues,worker,types,connection}, session-state, payment-result
  services/
    api-gateway/      :3000  auth (ApiKey→JWT), rate-limit, routing  (T13/T14)
    session-service/  :3001  sessões, FX call, checkout HTML, /pay, expiry+timeout sweepers
    payment-service/  :3002  WORKER fila payment-process → C2B → processResult
    callback-service/ :3003  POST /callback/mpesa → processResult
    kyc-service/      :3004  validação ativa + monitor passivo (BullMQ repeatable)
    fx-service/       :3005  USD→MZN, spread, cache Redis
    notification-service/ WORKER fila merchant-notify → webhook HMAC + retry/DLQ
  mockstore/          :4000  loja demo (AINDA STUB — T27/T28)
  ops/docker-compose.yml  postgres16 + redis7
  docs/  ARCHITECTURE.md, adr/ADR-001, HANDOFF.md(este), classDiagram, tese PDF
```

## 5. Modelo de dados (Prisma, 13 modelos)

Merchant, ApiKey, Webhook, Session, Payment, FXRate, Client, KYCProfile,
IdempotencyKey, Transaction, ProviderRequest, LedgerEntry, AuditLog.
Enums: MerchantStatus, SessionStatus(PENDING/PROCESSING/COMPLETED/FAILED/EXPIRED),
PaymentStatus(INITIATED/PENDING/SUCCESS/FAILED), TransactionStatus(SUCCESS/FAILED),
RiskLevel(LOW/MEDIUM/HIGH).
Notas: Client só guarda `phoneHash` (SHA-256, nunca MSISDN em claro). Payment NÃO
tem montante (vem de session.amountMZN). Session.fxRateId @unique. Payment.sessionId
@unique (1 pagamento/sessão).

## 6. Fluxo ponta-a-ponta (estado atual do código)

1. `POST /sessions/create` (session-service, T15) → quota FX → Session PENDING +
   FXRate snapshot + audit; devolve `checkoutUrl`.
2. `GET /checkout/:id` (T19) → HTML form (ou state page); `GET /sessions/:id` JSON
   público; `POST /sessions/:id/validate-phone` (RF04).
3. `POST /sessions/:id/pay` (T20) → idempotency (IdempotencyKey, replay primeiro) →
   valida sessão+phone → **KYC ativo via HTTP** → cria Payment INITIATED →
   `transitionSession` PROCESSING → grava IdempotencyKey → **enqueuePayment**. 202.
4. **payment-service worker** (T21) consome payment-process → `c2bPayment` (mock:
   msisdn termina em `9` = recusa) → delega a `processResult`.
5. **`processResult`** (shared, T23) — autenticidade (thirdPartyReference) → atómico:
   Transaction + ProviderRequest + Payment + **LedgerEntry DEBIT/CREDIT** (T24) →
   `transitionSession` COMPLETED/FAILED → audit → **enqueueNotify** (resolve webhook).
6. **notification-service worker** (T25) consome merchant-notify → assina HMAC
   (`X-CoffePay-Signature`) → POST ao merchant → 2xx=audit DELIVERED; falha→retry→DLQ.
7. Timeout (T22): sweeper falha pagamentos presos (PROCESSING além de PAYMENT_TIMEOUT_MS).
8. KYC passivo (T18): BullMQ repeatable reavalia risco por padrões (velocity/acumulado/falhas).

FALTA fechar o ciclo visível: redirect ao merchant (T26), mockstore (T27/T28), UI
checkout rica (T29/T30).

## 7. Convenções de código (seguir à risca)

- Cada serviço: `config.ts` (zod, `baseEnvSchema.extend`, singleton cached), `app.ts`
  (express + error handler central `isAppError`→toJSON, senão 500), `index.ts` (boot).
- Lógica de negócio com **deps injetáveis** (ex.: `quoteFn`, `kycCheck`, `enqueue`,
  `c2b`, `notify`, `post`) p/ testar sem rede/fila.
- Erros: classes de `@coffepay/shared` (ValidationError 400, AuthError 401,
  ForbiddenError 403, NotFoundError 404, ConflictError 409, ...). Códigos machine-readable.
- Testes: integração com Postgres+Redis reais; criam merchant/sessões próprias, limpam
  no `afterAll` (cascade via merchant.delete). Jest ESM: `jest.config.mjs` +
  `jest.setup.mjs` (dotenv .env raiz) idênticos por serviço. `jest` global NÃO existe
  em ESM — usar closures, não `jest.fn`.
- Sweepers: `setInterval` unref (session-service); KYC passivo usa BullMQ repeatable.
- Decimais Prisma: `.toFixed(2)` p/ dinheiro (toString dá '635' não '635.00').

## 8. Comandos

```bash
cd /home/yannickrafael/coffepay
docker compose -f ops/docker-compose.yml up -d   # postgres + redis (preciso p/ testes)
npm run db:deploy                                  # migrations
npm run db:generate                                # prisma client
npm run build        # tsc -b (project references)
npm test             # todos os workspaces (precisa infra up)
npm test -w @coffepay/<svc>
npm run lint         # eslint . (1 warning pré-existente em api-gateway/errorHandler.ts — IGNORAR)
npm run typecheck    # por workspace, tsc --noEmit
npm run format / format:check
```

Antes de commit: build + typecheck + lint + format:check todos limpos + testes verdes.

## 9. Progresso (31/49 fechadas, 63%)

- **Fase 1 (setup) ✅** T01–T07: monorepo, prisma, shared, mpesa client, HMAC, BullMQ, CI.
- **Fase 2 (core) ✅** T08–T18 + testes T12b/T14b/T15b/T17b: FX, gateway+auth, sessions,
  lifecycle, KYC ativo+passivo.
- **Fase 3 (integração)** — feito: T19(checkout), T20+T20b(pay+idempotency),
  T21(worker pagamento), T22(timeout), T23+T23b(result handler+autenticidade),
  T24(ledger), **T25(notificação)**.
- TODAS as issues da Fase 3 (#26–#37) já têm descrição detalhada escrita.

## 10. PRÓXIMO PASSO

**#32 / T25b** — Testes do notification worker (T25): assinatura HMAC verificável,
entrega 2xx auditada, falha→retry, filtragem ativo/subscrição, DLQ.

- Implementação está em `services/notification-service/src/notify.worker.ts`
  (`processNotifyJob(job, { post })`, `post` injetável).
- Adicionar `jest.config.mjs` + `jest.setup.mjs` (copiar doutro serviço), mudar
  `test` script p/ jest, devDeps (jest, ts-jest, @types/jest, dotenv).
- Padrão: ver `callback-service/src/payment-result.test.ts` (merchant+webhook setup).

### Fase 3 restante depois de T25b

- #33 T26 — redirect cliente→merchant com estado (RF18)
- #34 T27 — mockstore: produto + Pay with CoffePay → cria sessão (fig27)
- #35 T28 — mockstore: receptor webhook (verifica HMAC) + confirmação (fig28)
- #36 T29 — checkout UI: nº+MZN+validação (figs29-30, RNF08)
- #37 T30 — checkout UI: estados awaiting/failed/invalid + polling (figs31-33)

### Fase 4 (resiliência) #38–43 / Fase 5 (polish) #44–49

T31 circuit breaker, T32 idempotência forte, T33 falha/retoma, T34 DLQ inspect,
T35 compose completo+ngrok, T36 auditLog completo, T37 unit shared, T38 e2e,
T39 swagger, T40 atualizar Cap V tese, T41 demo, T42 cleanup. (detalhar just-in-time)

## 11. Mapeamento issue↔task

Nº de issue do GitHub ≠ T-id. O T-id está SEMPRE no título da issue. Abertas começam
em #32 (T25b). Project board: github.com/users/yannickRafael/projects/4.

```
gh issue list --state open --limit 60 --json number,title --jq 'sort_by(.number)[]|"\(.number)\t\(.title)"'
```
