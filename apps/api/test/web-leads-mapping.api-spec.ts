import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestApp, createTestApp, resetData } from './helpers/app';

const TOKEN = 'test-web-form-token'; // виставляється в test/helpers/setup.ts

/**
 * Окремий файл (не web-leads.api-spec.ts) навмисно: `/public/leads` має ліміт
 * 10 запитів/хв (FR-W1), а throttler живе в пам'яті одного Nest-застосунку на
 * весь `describe` — новий `createTestApp()` тут дає власний бюджет запитів,
 * не деля його з рештою сценаріїв FR-W1–W9.
 *
 * FR-W4: реальні значення форми сайту (SergeyPush/wise-expert,
 * components/Calculator/CalculatorForm.tsx, звірено 27.08.2026) — раніше
 * WebFormMapping містив вигадані «ЄП 1–4 група», OrganizationalType не мав
 * жодного рядка, а DiyaCity рахувався напряму через toBool() і завжди був false.
 */
describe('WebFormMapping — реальні значення форми сайту', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetData(ctx.prisma);
  });

  function post(body: Record<string, unknown>) {
    return request(ctx.url).post('/api/v1/public/leads').set('x-web-form-token', TOKEN).send(body);
  }

  it.each([
    ['Загальна система', 'GENERAL'],
    ['Єдиний податок, 2гр.', 'EP2'],
    ['Єдиний податок, 3гр.', 'EP3_5'],
    ['Податок на виведений капітал', 'WITHDRAWN_CAPITAL_TAX'],
  ])('TaxSystem %s → %s', async (raw, mapped) => {
    const res = await post({ phone: '0671234567', TaxSystem: raw });
    expect(res.status).toBe(200);

    const client = await ctx.prisma.client.findFirstOrThrow();
    expect(client.taxSystem).toBe(mapped);
  });

  it('OrganizationalType — мультиселект мапиться токен за токеном', async () => {
    const res = await post({ phone: '0671234567', OrganizationalType: 'Продажі, Виробництво' });
    expect(res.status).toBe(200);

    const client = await ctx.prisma.client.findFirstOrThrow();
    expect(client.businessTypes.sort()).toEqual(['Виробництво', 'Продажі']);
  });

  it('OrganizationalType — одне немапленне значення серед декількох не губить решту', async () => {
    const res = await post({ phone: '0671234567', OrganizationalType: 'Продажі, Щось невідоме' });
    expect(res.status).toBe(200);

    const client = await ctx.prisma.client.findFirstOrThrow();
    expect(client.businessTypes).toEqual(['Продажі']);

    const webLead = await ctx.prisma.webLead.findFirstOrThrow();
    expect(webLead.error).toContain('Щось невідоме');
  });

  it.each(['startup', 'general_resident'])(
    'DiyaCity %s → isDiiaCity true (раніше toBool() ніколи не впізнавав ці коди)',
    async (raw) => {
      const res = await post({ phone: '0671234567', DiyaCity: raw });
      expect(res.status).toBe(200);

      const client = await ctx.prisma.client.findFirstOrThrow();
      expect(client.isDiiaCity).toBe(true);
    },
  );
});
