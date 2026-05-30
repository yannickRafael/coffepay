# ADR-001 — Adaptação síncrono→assíncrono da Vodacom OpenAPI

- **Estado:** Aceite
- **Data:** 2026-05-29
- **Contexto:** Cap. V da tese (fluxo de pagamento, diagrama de sequência fig. 25)

## Contexto

A tese descreve o fluxo de pagamento M-Pesa no estilo **Daraja STK Push**: o gateway
inicia o pagamento, recebe uma resposta imediata de "pedido aceite", e mais tarde
recebe o resultado final através de um **webhook/callback assíncrono** enviado pelo
M-Pesa.

A API efectivamente disponível para Moçambique — **Vodacom Moçambique OpenAPI**
(decisão de projecto) — expõe o **C2B `singleStage`**
(`/ipg/v2/vodacomMOZ/c2bPayment/singleStage/`), que é **síncrono**:

- a autenticação faz-se encriptando a API Key com a chave pública RSA, obtendo um
  Bearer token de sessão (≈1h);
- o pedido C2B é **request–response**: a chamada HTTP fica pendente enquanto o
  utilizador introduz o PIN no dispositivo e devolve o resultado final na mesma
  resposta (não há callback assíncrono nativo do lado do M-Pesa).

Há, portanto, um desencontro entre o fluxo assíncrono assumido na tese e o
comportamento síncrono da API real.

## Decisão

Manter o **fluxo assíncrono na fronteira do CoffePay** e absorver a natureza
síncrona da OpenAPI **internamente**:

1. O `payment-service` **não** chama o M-Pesa no pedido HTTP do utilizador. Em vez
   disso, **enfileira** o pagamento na fila BullMQ `payment-process` e responde de
   imediato com estado `PENDING` + `paymentId`.
2. Um **worker** consome a fila e executa o C2B `singleStage` (chamada síncrona,
   bloqueante para o worker, com timeout e circuit breaker — RNF04). O resultado
   final da resposta é tratado como o "resultado do pagamento".
3. O resultado é entregue ao `callback-service` (internamente), que persiste
   `Transaction`/`LedgerEntry`/`AuditLog` e **enfileira** `merchant-notify`.
4. O merchant é notificado por **webhook assinado (HMAC)** — preservando o contrato
   assíncrono que a tese descreve, independentemente de o provedor ser síncrono.
5. O cliente do checkout faz **polling** (`GET` sessão) e/ou aguarda o redireccionamento
   para acompanhar o estado (`PENDING → SUCCESS/FAILED`).

Ou seja: o "callback do M-Pesa" da tese é re-mapeado para o **resultado síncrono do
C2B**, e a assincronia exigida pelos requisitos é fornecida pela **orquestração
interna (filas) + webhooks** do próprio CoffePay.

## Consequências

**Positivas**

- O contrato externo (sessão → checkout → webhook assinado) mantém-se conforme a
  tese e os requisitos (RF15/RF17, RNF04/RNF05).
- Idempotência, retry e DLQ ficam sob controlo do CoffePay (não dependem do provedor).
- Desacopla o tempo de resposta do utilizador da latência do PIN/M-Pesa.

**Negativas / riscos**

- O worker bloqueia durante a chamada síncrona → exige pool/concorrência e timeouts
  bem definidos para não esgotar recursos.
- Em ambiente sem credenciais reais, o cliente M-Pesa corre em **modo mock** (T08/T09).
- A tese (Cap. V) deve ser actualizada para reflectir esta adaptação — tratado em **T40**.

## Alternativas consideradas

- **Chamar o C2B directamente no request do utilizador (síncrono ponta-a-ponta):**
  rejeitado — acopla a UX à latência do PIN, dificulta retry/idempotência e diverge
  do fluxo assíncrono dos requisitos.
- **Trocar de provedor para um com STK Push + callback nativo:** fora de âmbito; a
  decisão de projecto fixou a Vodacom Moçambique OpenAPI como caso de estudo.

## Impacto

T08, T09 (cliente M-Pesa), T21 (worker de pagamento), T23 (handler de resultado),
T25 (notificação), T40 (actualização da tese).
