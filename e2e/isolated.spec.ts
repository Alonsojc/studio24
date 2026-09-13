import { test, expect, type Page } from '@playwright/test';

const id = '10000000-0000-0000-0000-000000000001';
const version = '2026-09-13T12:00:00Z';
async function isolate(page: Page, role: 'admin' | 'operador' | 'contador' = 'admin') {
  const user = {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'test@example.invalid',
    app_metadata: {},
    user_metadata: {},
  };
  const session = {
    access_token: 'test-token',
    refresh_token: 'test-refresh',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  };
  await page.route('**/*.supabase.co/**', async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    let data: unknown = [];
    if (url.pathname.endsWith('/auth/v1/token')) data = session;
    else if (url.pathname.endsWith('/auth/v1/user')) data = user;
    else if (table === 'profiles') data = { id, email: user.email, role, nombre: 'Prueba' };
    else if (table === 'team_members') data = { role, team_id: 'team-test' };
    else if (table === 'config') data = { nombre_negocio: 'Studio 24 Test', updated_at: version };
    else if (table === 'finance_entries' && !url.searchParams.has('id'))
      data = [
        { id: 'finance-test', kind: 'donacion', period: '2026-09', amount: 20, separated: true, updated_at: version },
      ];
    else if (table === 'get_public_pedido_tracking')
      data = {
        pedido: {
          descripcion: 'Pedido publico de prueba',
          concepto: 'solo_bordado',
          piezas: 1,
          montoTotal: 100,
          montoPagado: 0,
          estadoPago: 'pendiente',
          estado: 'pendiente',
          fechaPedido: '2026-09-13',
        },
        cliente: { nombre: 'Cliente' },
        config: { nombreNegocio: 'Studio 24 Test' },
      };
    else if (table === 'sync_write_record') {
      const body = route.request().postDataJSON();
      data = { ...body.p_record, updated_at: new Date().toISOString() };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  // Tests never send events or writes to external systems.
  await page.route('**/*.sentry.io/**', (route) => route.fulfill({ status: 200, body: '{}' }));
  await page.addInitScript(() => {
    localStorage.setItem('bordados_cloud_migrated', '1');
  });
}
async function login(page: Page, role: 'admin' | 'operador' | 'contador' = 'admin') {
  await isolate(page, role);
  await page.goto('./');
  await page.getByPlaceholder('Email').fill('test@example.invalid');
  await page.getByPlaceholder('Contraseña').fill('isolated-test-password');
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  await expect(page.getByRole('link', { name: /^ajustes$/i })).toBeVisible();
}
test('static build renders login without runtime exceptions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await isolate(page);
  await page.goto('./');
  await expect(page.getByPlaceholder('Email')).toBeVisible();
  expect(errors).toEqual([]);
});
test('operator cannot enter financial pages', async ({ page }) => {
  await login(page, 'operador');
  await page.goto('ingresos');
  await expect(page.getByText('No tienes permiso para abrir esta sección')).toBeVisible();
});
test('accountant cannot enter production pages', async ({ page }) => {
  await login(page, 'contador');
  await page.goto('pedidos');
  await expect(page.getByText('No tienes permiso para abrir esta sección')).toBeVisible();
});
test('public tracking renders without login', async ({ page }) => {
  await isolate(page);
  await page.goto('seguimiento?t=' + 'a'.repeat(48));
  await expect(page.getByText('Pedido publico de prueba')).toBeVisible();
  await expect(page.getByPlaceholder('Contraseña')).toHaveCount(0);
});
test('cached records survive navigation without repeating the auth screen', async ({ page }) => {
  await login(page);
  await page.goto('egresos');
  await expect(page.getByRole('heading', { name: /^egresos$/i })).toBeVisible();
  await page.getByRole('button', { name: 'FINANZAS', exact: true }).click();
  await page.getByRole('link', { name: /^ingresos$/i }).click();
  await expect(page.getByRole('heading', { name: /^ingresos$/i })).toBeVisible();
  await expect(page.getByText('Conectando con Studio 24...')).toHaveCount(0);
});

test('conflicts remain visible and require an explicit choice', async ({ page }, testInfo) => {
  await login(page);
  await page.evaluate(() => {
    const item = { id: 'local-test', nombre: 'Cambio pendiente' };
    localStorage.setItem('bordados_clientes', JSON.stringify([item]));
    localStorage.setItem(
      'bordados_sync_queue',
      JSON.stringify([
        {
          id: 'conflict-test-operation',
          table: 'clientes',
          localKey: 'bordados_clientes',
          action: 'upsert',
          recordId: item.id,
          payload: item,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          attempts: 1,
          lastError: 'CONFLICT: registro eliminado',
        },
      ]),
    );
    window.dispatchEvent(new Event('studio24:sync-queue'));
  });
  await page.getByRole('button', { name: /Revisar clientes/ }).click();
  await expect(page.getByRole('dialog', { name: 'Conflicto de sincronizacion' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Usar cambio local' })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('conflict-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('conflict-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Usar nube' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bordados_sync_queue') || '[]').length)).toBe(0);
});
