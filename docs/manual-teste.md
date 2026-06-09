# Manual de Teste e Demonstração — CoffePay

Guia passo-a-passo para correr o sistema completo, testar cada cenário e capturar
os screenshots para a defesa (issue #48 / T41). Segue a ordem; cada bloco
**📸 SCREENSHOT** indica o que fotografar e com que nome guardar.

Sugestão: cria a pasta `docs/screenshots/` e guarda lá tudo com os nomes indicados.

---

## 0. Pré-requisitos

- Node ≥ 22 e Docker + Docker Compose instalados.
- Portas livres: `3000` (gateway), `3001` (checkout), `3003` (callback),
  `3004` (kyc), `3005` (fx), `4000` (mockstore), `5432` (postgres), `6379` (redis).
- Estás em `/home/yannickrafael/coffepay`.

```bash
cd /home/yannickrafael/coffepay
docker --version && docker compose version && node --version
```

📸 **SCREENSHOT** `00-versoes.png` — saída das versões (prova do ambiente).

---

## 1. Arrancar o stack completo

Uma só imagem constrói o monorepo; o compose levanta 8 serviços + mockstore +
Postgres + Redis. O serviço `migrate` corre migrações e seed (merchant demo +
API key `cp_dev_sk_demo_0001`) e só depois os serviços arrancam.

```bash
cp .env.example .env          # 1ª vez apenas
docker compose --env-file .env -f ops/docker-compose.yml up --build -d
```

> A flag `--env-file .env` é obrigatória nos comandos `up`: o compose está em
> `ops/` e sem ela não lê o `.env` da raiz (toda a config vem do `.env`, sem
> valores hardcoded). Para `MPESA_MOCK=false` valer, define-o no `.env` **e**
> preenche `MPESA_API_KEY` + `MPESA_PUBLIC_KEY` (senão cai em mock).

Espera ~30–60 s. Confirma que tudo está de pé:

```bash
docker compose -f ops/docker-compose.yml ps
```

Todos os serviços devem estar `running` (ou `Up`); o `migrate` aparece como
`exited (0)` — é o esperado (one-shot).

📸 **SCREENSHOT** `01-compose-ps.png` — tabela com todos os contentores up.

Ver os logs do seed (prova de que o merchant demo foi criado):

```bash
docker compose -f ops/docker-compose.yml logs migrate
```

📸 **SCREENSHOT** `02-migrate-seed.png` — logs com migrações aplicadas + seed.

---

## 2. Documentação da API (Swagger)

Abre no browser:

> http://localhost:3000/docs

📸 **SCREENSHOT** `03-swagger.png` — Swagger UI com a lista de endpoints
(`/sessions/create`, `/sessions/:id`, `/sessions/:id/pay`, admin, etc.).

(Opcional) o JSON cru: http://localhost:3000/openapi.json

---

## 3. Loja demo (mockstore) — ponto de partida do cliente

Abre:

> http://localhost:4000

É a "loja online" que integrou o CoffePay. Mostra um produto e o botão
**Pay with CoffePay**.

📸 **SCREENSHOT** `04-loja-produto.png` — página da loja com o produto e o botão.

---

## 4. Cenário A — Pagamento com SUCESSO (caminho feliz)

Este é o fluxo principal: loja → sessão → checkout → C2B M-Pesa → ledger →
webhook → redirect.

> ℹ️ **Regra do modo mock**: o número de telemóvel **determina o resultado**.
> Número que **termina em `0000`** → pagamento **recusado** (INS-996).
> Qualquer outro número → pagamento **aceite** (INS-0). Usa isto para forçar
> cada cenário (o teu número real, termine no dígito que terminar, é aceite).

1. Na loja (http://localhost:4000) clica **Pay with CoffePay**.
   - A loja chama `POST /buy` → `POST /sessions/create` (com a API key) e abre uma
     **janela popup** da CoffePay (estilo autenticação Google) em
     `http://localhost:3001/checkout/<id>`. A tab da loja fica por baixo, à espera.

   📸 **SCREENSHOT** `05-checkout-form.png` — popup de checkout (com o logo
   CoffePay): valor em USD e o equivalente em MZN (taxa FX fixada), campo para o
   número de telemóvel.

2. Insere um número M-Pesa válido (qualquer um que **não** termine em `0000`),
   ex.: `841234567` — ou o teu próprio número. Confirma.
   - O checkout chama `POST /sessions/:id/validate-phone` e depois
     `POST /sessions/:id/pay` (com `Idempotency-Key`). Resposta `202`: pagamento
     enfileirado.

   📸 **SCREENSHOT** `06-awaiting.png` — ecrã "a aguardar" (a página faz polling
   ao estado da sessão).

3. Aguarda 1–3 s. O worker corre o C2B (mock = aceite), grava
   `Transaction` + `LedgerEntry` (débito/crédito), marca a sessão `COMPLETED` e
   enfileira a notificação.

   📸 **SCREENSHOT** `07-sucesso.png` — ecrã de sucesso no checkout.

4. O popup fecha-se sozinho e devolve o resultado à tab da loja (handshake
   `postMessage`, estilo Google). A loja — que já recebeu o **webhook assinado
   (HMAC)** — mostra a confirmação do pedido **inline**, sem recarregar.

   📸 **SCREENSHOT** `08-loja-confirmado.png` — tab da loja a confirmar o
   pagamento recebido (via webhook), depois de o popup fechar.

5. Prova do webhook nos logs da loja:

   ```bash
   docker compose -f ops/docker-compose.yml logs mockstore | grep -i webhook
   ```

   📸 **SCREENSHOT** `09-webhook-log.png` — log da loja a registar o webhook
   recebido e a assinatura válida.

---

## 5. Cenário B — Pagamento RECUSADO

Repete o fluxo da loja, mas no checkout usa um número que **termina em `0000`**,
ex.: `841230000`.

- O C2B mock devolve `INS-996`; a sessão fica `FAILED`; o checkout mostra falha.

📸 **SCREENSHOT** `10-recusado.png` — ecrã de pagamento recusado no checkout.

(Opcional) confirma o estado via API:

```bash
curl -s http://localhost:3001/sessions/<ID_DA_SESSAO> | jq
```

📸 **SCREENSHOT** `11-estado-failed.png` — JSON da sessão com `status: FAILED`.

---

## 6. Cenário C — Auditoria e Ledger (dupla entrada)

Mostra a integridade contabilística. Liga-te à base de dados:

```bash
docker compose -f ops/docker-compose.yml exec postgres \
  psql -U coffepay -d coffepay -c \
  "SELECT type, amount, balance FROM \"LedgerEntry\" ORDER BY \"createdAt\" DESC LIMIT 10;"
```

📸 **SCREENSHOT** `12-ledger.png` — linhas DEBIT (cliente) + CREDIT (merchant)
do pagamento com sucesso.

```bash
docker compose -f ops/docker-compose.yml exec postgres \
  psql -U coffepay -d coffepay -c \
  "SELECT action, \"entityType\", \"createdAt\" FROM \"AuditLog\" ORDER BY \"createdAt\" DESC LIMIT 15;"
```

📸 **SCREENSHOT** `13-auditoria.png` — trilho de auditoria (PAYMENT_INITIATED,
C2B_REQUESTED, WEBHOOK_DELIVERED, etc.).

> Privacidade (RNF): repara que o `Client` guarda só `phoneHash` — o número nunca
> aparece em claro. Mostra isto:

```bash
docker compose -f ops/docker-compose.yml exec postgres \
  psql -U coffepay -d coffepay -c "SELECT id, \"phoneHash\" FROM \"Client\" LIMIT 5;"
```

📸 **SCREENSHOT** `14-phonehash.png` — coluna `phoneHash` (sem MSISDN em claro).

---

## 7. Cenário D — Liquidação ao merchant (settlement, tese V2)

Liquidação periódica: agrega as transacções com sucesso ainda não liquidadas,
deduz a taxa de serviço, converte o líquido para USD e regista um `Settlement`.
Em vez de esperar pelo job repetível, dispara manualmente pela rota admin.

> Usa a `ADMIN_API_KEY` do teu `.env` (por defeito `change-me-admin-dev-only`).

```bash
# Disparar a liquidação
curl -s -X POST http://localhost:3000/admin/settlements/run \
  -H "X-Admin-Key: change-me-admin-dev-only" | jq
```

📸 **SCREENSHOT** `15-settlement-run.png` — resposta com `count` de liquidações.

```bash
# Listar liquidações
curl -s http://localhost:3000/admin/settlements \
  -H "X-Admin-Key: change-me-admin-dev-only" | jq
```

📸 **SCREENSHOT** `16-settlement-list.png` — `Settlement` com `amountMZN`,
`amountUSD`, `fxRate`, `feesDeducted`, `status: COMPLETED`.

> Idempotência: corre o `run` outra vez — não cria liquidações duplicadas
> (cada transacção entra em exactamente um settlement).

📸 **SCREENSHOT** `17-settlement-idempotente.png` — segundo `run` com
`count: 0` (nada por liquidar).

---

## 8. Cenário E — Resiliência: DLQ (Dead Letter Queue)

Mostra como falhas persistentes de webhook param numa DLQ inspeccionável.
Lista a DLQ de notificações:

```bash
curl -s http://localhost:3000/admin/dlq/merchant-notify-dlq \
  -H "X-Admin-Key: change-me-admin-dev-only" | jq
```

📸 **SCREENSHOT** `18-dlq-list.png` — resposta da DLQ (vazia se nada falhou, ou
com itens se houver falhas de entrega).

> Para forçar uma falha real de webhook e ver um item na DLQ, podes parar a
> loja antes de pagar (`docker compose ... stop mockstore`), fazer um pagamento
> com sucesso (o webhook falha → retenta → DLQ), e voltar a listar. Reinicia a
> loja depois (`start mockstore`).

---

## 9. Encerrar

```bash
# Parar mantendo os dados
docker compose -f ops/docker-compose.yml down

# Parar e apagar volumes (reset total da BD)
docker compose -f ops/docker-compose.yml down -v
```

---

## Resumo dos screenshots a entregar

| Ficheiro                        | O que prova                   |
| ------------------------------- | ----------------------------- |
| `00-versoes.png`                | Ambiente (Node/Docker)        |
| `01-compose-ps.png`             | 8 serviços + infra de pé      |
| `02-migrate-seed.png`           | Migrações + seed              |
| `03-swagger.png`                | Documentação da API           |
| `04-loja-produto.png`           | Loja integrada                |
| `05-checkout-form.png`          | Checkout com FX USD→MZN       |
| `06-awaiting.png`               | Polling do estado             |
| `07-sucesso.png`                | Pagamento aceite              |
| `08-loja-confirmado.png`        | Confirmação na loja (webhook) |
| `09-webhook-log.png`            | Webhook HMAC entregue         |
| `10-recusado.png`               | Pagamento recusado            |
| `11-estado-failed.png`          | Estado FAILED via API         |
| `12-ledger.png`                 | Ledger dupla entrada          |
| `13-auditoria.png`              | Trilho de auditoria           |
| `14-phonehash.png`              | Privacidade (phoneHash)       |
| `15-settlement-run.png`         | Liquidação disparada          |
| `16-settlement-list.png`        | Liquidação registada          |
| `17-settlement-idempotente.png` | Idempotência da liquidação    |
| `18-dlq-list.png`               | DLQ de resiliência            |

Estes cobrem o fluxo ponta-a-ponta + os requisitos não-funcionais (auditoria,
privacidade, idempotência, resiliência, liquidação) para a defesa.
