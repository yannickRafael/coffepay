import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Dev API key shown here only for local testing. T14 replaces the sha256
// placeholder below with a real bcrypt hash and proper key issuance.
const DEV_API_KEY = 'cp_dev_sk_demo_0001';
const keyHash = createHash('sha256').update(DEV_API_KEY).digest('hex');

async function main() {
  const merchant = await prisma.merchant.upsert({
    where: { nuit: '400123456' },
    update: {},
    create: {
      name: 'CoffePay Demo Store',
      nuit: '400123456',
      status: 'ACTIVE',
      apiKeys: {
        create: { type: 'DEV', keyHash, isActive: true },
      },
      webhooks: {
        create: {
          url: 'http://localhost:4000/webhooks/coffepay',
          events: 'payment.success,payment.failed',
          isActive: true,
        },
      },
    },
    include: { apiKeys: true, webhooks: true },
  });

  console.log('Seeded merchant:', merchant.id);
  console.log('  apiKey:', merchant.apiKeys[0]?.id, '(raw dev key:', DEV_API_KEY + ')');
  console.log('  webhook:', merchant.webhooks[0]?.id);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
