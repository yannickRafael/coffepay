import { PrismaClient } from '@prisma/client';
import { hashSecret } from '../src/crypto/password.js';

const prisma = new PrismaClient();

// Dev API key shown here only for local testing. Stored as a bcrypt hash.
const DEV_API_KEY = 'cp_dev_sk_demo_0001';

async function main() {
  const keyHash = await hashSecret(DEV_API_KEY);

  const merchant = await prisma.merchant.upsert({
    where: { nuit: '400123456' },
    update: { status: 'ACTIVE' },
    create: { name: 'CoffePay Demo Store', nuit: '400123456', status: 'ACTIVE' },
  });

  // Idempotent: reset the demo key/webhook so re-seeding applies the latest hash.
  await prisma.apiKey.deleteMany({ where: { merchantId: merchant.id } });
  const apiKey = await prisma.apiKey.create({
    data: { merchantId: merchant.id, type: 'DEV', keyHash, isActive: true },
  });

  await prisma.webhook.deleteMany({ where: { merchantId: merchant.id } });
  const webhook = await prisma.webhook.create({
    data: {
      merchantId: merchant.id,
      url: 'http://localhost:4000/webhooks/coffepay',
      events: 'payment.success,payment.failed',
      isActive: true,
    },
  });

  console.log('Seeded merchant:', merchant.id);
  console.log('  apiKey:', apiKey.id, '(raw dev key:', DEV_API_KEY + ')');
  console.log('  webhook:', webhook.id);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
