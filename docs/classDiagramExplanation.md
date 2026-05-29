## Classes, Atributos e Relações

---

### 1. Merchant
Representa uma plataforma de destino registada no sistema CoffePay — por exemplo a mock store.

**Atributos:**
- `merchantId` — identificador único da plataforma
- `name` — nome comercial da plataforma
- `nuit` — número de identificação fiscal
- `status` — estado da plataforma: ACTIVE ou SUSPENDED
- `createdAt` — data de registo no sistema

**Métodos:**
- `authenticate()` — verifica se as credenciais da plataforma são válidas
**Relações:**
- cria muitas `Session` — cada vez que um utilizador clica em "Pagar com CoffePay" na loja
- possui muitas `ApiKey` — cada loja pode ter múltiplas chaves para ambientes diferentes
- regista muitos `Webhook` — para receber notificações de pagamentos

---

### 2. ApiKey
Representa uma chave de autenticação associada a um merchant.

**Atributos:**
- `keyId` — identificador único da chave
- `merchantId` — referência ao merchant proprietário
- `type` — tipo da chave: PROD (produção) ou DEV (desenvolvimento/testes)
- `keyHash` — hash da chave — nunca se guarda a chave em claro
- `isActive` — indica se a chave está activa ou revogada

**Métodos:**
- `validate()` — verifica se a chave é válida e está activa
- `revoke()` — desactiva a chave permanentemente

**Relações:**
- pertence a um `Merchant`

---

### 3. Session
Representa uma sessão de pagamento criada quando o utilizador clica em "Pagar com CoffePay".

**Atributos:**
- `sessionId` — identificador único da sessão
- `merchantId` — referência ao merchant que criou a sessão
- `orderId` — identificador da encomenda no sistema do merchant
- `amountUSD` — valor original em dólares
- `amountMZN` — valor convertido em Meticais
- `callbackUrl` — endereço para notificar o merchant após conclusão
- `status` — estado: PENDING, PROCESSING, COMPLETED, FAILED, EXPIRED
- `createdAt` — momento de criação
- `expiresAt` — momento de expiração — se não for completada até esta hora é cancelada

**Métodos:**
- `create()` — cria uma nova sessão
- `expire()` — cancela a sessão por inactividade

**Relações:**
- pertence a um `Merchant`
- inicia um `Payment`
- usa uma `FXRate` para a conversão cambial

---

### 4. FXRate
Representa a taxa de câmbio usada numa sessão de pagamento.

**Atributos:**
- `rateId` — identificador único
- `fromCurrency` — moeda de origem — USD
- `toCurrency` — moeda de destino — MZN
- `rate` — taxa de câmbio no momento da sessão
- `serviceFee` — taxa de serviço do CoffePay aplicada à transacção
- `fetchedAt` — momento em que a taxa foi obtida
- `expiresAt` — momento a partir do qual a taxa já não é válida

**Métodos:**
- `convert(amount)` — converte um valor de USD para MZN aplicando a taxa e a taxa de serviço
- `refresh()` — actualiza a taxa de câmbio a partir da fonte externa

**Relações:**
- associada a uma `Session` — cada sessão tem a sua taxa fixada no momento da criação

---

### 5. Client
Representa o utilizador final que inicia o pagamento.

**Atributos:**
- `clientId` — identificador único do utilizador
- `phoneHash` — hash do número de telemóvel — nunca se guarda o número em claro por razões de privacidade
- `createdAt` — data do primeiro registo no sistema

**Métodos:**
- `getProfile()` — devolve o perfil KYC associado ao utilizador

**Relações:**
- associado a um `Payment`
- tem um `KYCProfile`

---

### 6. Payment
Representa uma tentativa de pagamento iniciada pelo utilizador na página de checkout.

**Atributos:**
- `paymentId` — identificador único
- `sessionId` — referência à sessão associada
- `clientId` — referência ao utilizador que está a pagar
- `idempotencyKey` — chave única que evita pagamentos duplicados
- `status` — estado: INITIATED, PENDING, SUCCESS, FAILED
- `attempts` — número de tentativas realizadas
- `initiatedAt` — momento de iniciação
- `completedAt` — momento de conclusão

**Métodos:**
- `initiate()` — inicia o processo de pagamento e o STK Push
- `cancel()` — cancela o pagamento

**Relações:**
- pertence a uma `Session`
- pertence a um `Client`
- gera uma `Transaction`
- associa uma `IdempotencyKey`
- valida um `KYCProfile`

---

### 7. KYCProfile
Representa o perfil de conformidade regulatória de um utilizador.

**Atributos:**
- `profileId` — identificador único
- `clientId` — referência ao utilizador
- `riskLevel` — nível de risco: LOW, MEDIUM, HIGH
- `isBlacklisted` — indica se o utilizador está em lista negra
- `transactionCount` — número de transacções realizadas — usado para detectar padrões suspeitos
- `lastValidatedAt` — última vez que o perfil foi validado activamente
- `updatedAt` — última actualização do perfil

**Métodos:**
- `validate()` — executa a validação KYC/AML activa e devolve o resultado
- `updateRisk()` — actualiza o nível de risco com base no histórico transaccional — validação passiva

**Relações:**
- pertence a um `Client`
- consultado por um `Payment`

---

### 8. IdempotencyKey
Garante que a mesma transacção não é processada duas vezes — essencial em contextos de conectividade instável.

**Atributos:**
- `keyId` — identificador único
- `key` — chave única gerada para cada tentativa de pagamento
- `paymentId` — referência ao pagamento associado
- `result` — resultado já processado — se o pedido for repetido devolve este resultado em vez de processar novamente
- `createdAt` — momento de criação
- `expiresAt` — momento de expiração da chave

**Métodos:**
- `isDuplicate()` — verifica se a chave já foi usada
- `storeResult()` — guarda o resultado para devolução em caso de pedido duplicado

**Relações:**
- associada a um `Payment`

---

### 9. Transaction
Representa uma transacção financeira concluída — criada após confirmação do M-Pesa.

**Atributos:**
- `transactionId` — identificador único
- `paymentId` — referência ao pagamento que originou esta transacção
- `amountMZN` — valor debitado em Meticais
- `status` — estado: SUCCESS ou FAILED
- `processedAt` — momento em que foi processada pelo M-Pesa
- `confirmedAt` — momento em que foi confirmada pelo gateway

**Métodos:**
- `confirm()` — marca a transacção como concluída com sucesso
- `fail()` — marca a transacção como falhada

**Relações:**
- criada por um `Payment`
- regista múltiplos `ProviderRequest`
- gera múltiplas `LedgerEntry`
- audita múltiplos `AuditLog`

---

### 10. ProviderRequest
Regista cada comunicação técnica com o M-Pesa — tanto o pedido enviado como a resposta recebida.

**Atributos:**
- `requestId` — identificador único
- `transactionId` — referência à transacção associada
- `provider` — nome do fornecedor: MPESA
- `requestPayload` — conteúdo exacto do pedido enviado ao M-Pesa
- `responsePayload` — conteúdo exacto da resposta recebida
- `httpStatus` — código HTTP da resposta
- `createdAt` — momento do registo

**Métodos:**
- `send()` — envia o pedido ao fornecedor
- `verify()` — verifica a autenticidade da resposta

**Relações:**
- associado a uma `Transaction`

---

### 11. LedgerEntry
Regista cada movimento financeiro no sistema — essencial para auditoria contabilística.

**Atributos:**
- `entryId` — identificador único
- `transactionId` — referência à transacção que gerou este movimento
- `entryType` — tipo: CREDIT ou DEBIT
- `amount` — valor do movimento
- `balanceAfter` — saldo após o movimento — snapshot imutável para auditoria
- `description` — descrição do movimento
- `createdAt` — momento de criação — imutável

**Métodos:**
- `record()` — cria uma nova entrada no ledger

**Relações:**
- associada a uma `Transaction`

---

### 12. Webhook
Representa uma configuração de notificação registada por um merchant para receber eventos do gateway.

**Atributos:**
- `webhookId` — identificador único
- `merchantId` — referência ao merchant
- `url` — endereço para onde as notificações são enviadas
- `events` — lista de eventos subscritos: payment.success, payment.failed
- `isActive` — indica se o webhook está activo

**Métodos:**
- `dispatch()` — envia a notificação para o endereço configurado
- `retry()` — retenta o envio em caso de falha

**Relações:**
- pertence a um `Merchant`

---

### 13. AuditLog
Regista todas as acções relevantes realizadas no sistema para fins de auditoria e rastreabilidade.

**Atributos:**
- `logId` — identificador único
- `actorId` — identificador de quem realizou a acção — utilizador, sistema ou administrador
- `action` — descrição da acção: SESSION_CREATED, PAYMENT_INITIATED, KYC_VALIDATED, etc.
- `entityType` — tipo de entidade afectada: Session, Payment, Transaction, etc.
- `entityId` — identificador da entidade afectada
- `changes` — registo do estado anterior e posterior em formato JSON
- `createdAt` — momento da acção — imutável

**Métodos:**
- `record()` — cria uma nova entrada de auditoria
- `query()` — pesquisa entradas de auditoria por critérios

**Relações:**
- associado a uma `Transaction`
