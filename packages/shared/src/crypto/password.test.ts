import { hashSecret, verifySecret } from './password.js';

describe('hashSecret / verifySecret', () => {
  test('verifies the correct secret', async () => {
    const hash = await hashSecret('cp_dev_sk_demo_0001');
    expect(await verifySecret('cp_dev_sk_demo_0001', hash)).toBe(true);
  });

  test('rejects a wrong secret', async () => {
    const hash = await hashSecret('right');
    expect(await verifySecret('wrong', hash)).toBe(false);
  });

  test('produces different hashes for the same input (salted)', async () => {
    const a = await hashSecret('same');
    const b = await hashSecret('same');
    expect(a).not.toBe(b);
    expect(await verifySecret('same', a)).toBe(true);
    expect(await verifySecret('same', b)).toBe(true);
  });
});
