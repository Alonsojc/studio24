import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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
    else if (table === 'get_order_summary') data = { activeCount: 0, activeTotal: 0, statuses: {}, payments: {} };
    else if (table === 'get_customer_directory') data = { rows: [], total: 0, registered: 0 };
    else if (table === 'get_collections')
      data = { rows: [], total: 0, totalPending: 0, overduePending: 0, overdueCount: 0, followupCount: 0 };
    else if (table === 'get_advance_report')
      data = Array.from({ length: 12 }, (_, index) => ({
        month: `2026-${String(index + 1).padStart(2, '0')}`,
        received: 0,
        receivedNet: 0,
        appliedNet: 0,
        available: 0,
        assigned: 0,
      }));
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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/0', 'access-control-expose-headers': 'content-range' },
      body: JSON.stringify(data),
    });
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

test('recovery stays outside business screens and updates the password before returning', async ({
  page,
}, testInfo) => {
  await login(page);
  await page.evaluate((user) => sessionStorage.setItem('studio24_password_recovery_user', user), id);
  let updated = false;
  await page.route('**/auth/v1/user', async (route) => {
    if (route.request().method() === 'PUT') {
      expect(route.request().postDataJSON().password).toBe('synthetic-new-password');
      updated = true;
    }
    await route.fulfill({
      json: {
        id,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'test@example.invalid',
        app_metadata: {},
        user_metadata: {},
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('ajustes');
  await expect(page.getByRole('heading', { name: 'Nueva contrasena' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^ajustes$/i })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('recovery-mobile.png'), fullPage: true });
  await page.getByLabel('Contrasena nueva', { exact: true }).fill('synthetic-new-password');
  await page.getByLabel('Confirmar contrasena', { exact: true }).fill('synthetic-new-password');
  await page.getByRole('button', { name: 'Guardar contrasena' }).click();
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('studio24_password_recovery_user'))).toBeNull();
  expect(updated).toBe(true);
});

test('a fresh recovery link opens the password form without loading business data', async ({ page }) => {
  await isolate(page);
  const businessReads: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/rest/v1/')) businessReads.push(request.url());
  });
  await page.goto(
    'ajustes#access_token=test-token&refresh_token=test-refresh&expires_in=3600&token_type=bearer&type=recovery',
  );
  await expect(page.getByRole('heading', { name: 'Nueva contrasena' })).toBeVisible();
  expect(businessReads).toEqual([]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Nueva contrasena' })).toBeVisible();
  expect(businessReads).toEqual([]);
});

test('invoice linking requires a choice and imports global IVA only once', async ({ page }) => {
  await login(page);
  const date = new Date().toISOString().slice(0, 10);
  const record = {
    id: '30000000-0000-0000-0000-000000000001',
    fecha: date,
    descripcion: 'Gasto sin factura',
    monto: 1000,
    iva: 160,
    monto_total: 1160,
    categoria: 'otro',
    subcategoria: '',
    proveedor_id: '',
    forma_pago: 'transferencia',
    factura: false,
    updated_at: version,
  };
  let releaseRecords!: () => void;
  const recordsReady = new Promise<void>((resolve) => (releaseRecords = resolve));
  await page.route('**/rest/v1/egresos?*', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (query.getAll('fecha').includes(`gte.${date.slice(0, 4)}-01-01`)) await recordsReady;
    await route.fulfill({ json: query.has('id') ? [] : [record] });
  });
  const writes: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/sync_write_record', async (route) => {
    const body = route.request().postDataJSON();
    writes.push(body.p_record);
    await route.fulfill({ json: { ...body.p_record, updated_at: new Date().toISOString() } });
  });
  await page.goto('facturas');
  await expect(page.locator('input[type="file"]')).toBeDisabled();
  releaseRecords();
  await expect(page.locator('input[type="file"]')).toBeEnabled();
  const xml = `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Fecha="${date}T10:00:00" SubTotal="1000" Total="1160" Moneda="MXN" TipoDeComprobante="I" FormaPago="03">
  <cfdi:Emisor Rfc="SUPPLIER" Nombre="Proveedor"/><cfdi:Receptor Rfc="BUSINESS" Nombre="Negocio" UsoCFDI="G03"/>
  <cfdi:Conceptos><cfdi:Concepto Descripcion="Bordado sintetico"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Impuesto="002" Importe="160"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto></cfdi:Conceptos>
  <cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Impuesto="002" Importe="160"/></cfdi:Traslados></cfdi:Impuestos>
  <cfdi:Complemento><tfd:TimbreFiscalDigital UUID="AAAAAAAA-1111-2222-3333-BBBBBBBBBBBB"/></cfdi:Complemento></cfdi:Comprobante>`;
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'synthetic.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await expect(page.getByRole('button', { name: 'Procesar todas' })).toBeDisabled();
  await page.getByLabel('Vincular factura').selectOption(record.id);
  await page.getByRole('button', { name: 'Procesar todas' }).click();
  await expect.poll(() => writes.length).toBe(1);
  await expect(page.getByRole('button', { name: /Procesar todas|Procesando/ })).toHaveCount(0);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ id: record.id, iva: 160, monto_total: 1160 });
  // With no available candidates, a second invoice still needs an explicit choice.
  await page.locator('input[type="file"]').setInputFiles({
    name: 'another.xml',
    mimeType: 'application/xml',
    buffer: Buffer.from(xml.replace('AAAAAAAA-1111-2222-3333-BBBBBBBBBBBB', 'CCCCCCCC-1111-2222-3333-DDDDDDDDDDDD')),
  });
  await expect(page.getByRole('button', { name: 'Procesar todas' })).toBeDisabled();
  await page.getByLabel('Vincular factura').selectOption('new');
  await expect(page.getByRole('button', { name: 'Procesar todas' })).toBeEnabled();
});

test('direct collection retries the same operation after a lost response', async ({ page }, testInfo) => {
  await login(page);
  const cliente = { id: 'collection-client', nombre: 'Clienta de prueba', updated_at: version };
  const pedido = {
    id: 'collection-order',
    cliente_id: cliente.id,
    descripcion: 'Pedido de prueba',
    monto_total: 100,
    monto_pagado: 0,
    pagos: [],
    estado: 'pendiente',
    estado_pago: 'pendiente',
    fecha_pedido: '2026-10-22',
    updated_at: version,
  };
  let account: Record<string, unknown> = { cliente, pedidos: [pedido], ingresos: [], advances: [], movements: [] };
  await page.route('**/rest/v1/rpc/get_customer_account', (route) => route.fulfill({ json: account }));
  const calls: {
    p_operation: string;
    p_data: { applicationId: string; amount: number; pedidoId: string; fecha: string };
  }[] = [];
  const genericWrites: unknown[] = [];
  await page.route('**/rest/v1/rpc/sync_write_record', (route) => {
    genericWrites.push(route.request().postDataJSON());
    return route.fulfill({ status: 400, json: { message: 'Use the atomic collection command' } });
  });
  await page.route('**/rest/v1/rpc/collect_order_payment', async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    expect(body.p_data).toMatchObject({ amount: 50, pedidoId: pedido.id, clienteId: cliente.id });
    const advance = {
      id: body.p_operation,
      cliente_id: cliente.id,
      ingreso_id: 'collection-income',
      source: 'new',
      fecha: body.p_data.fecha,
      amount: 50,
      forma_pago: 'transferencia',
      referencia: '',
      notas: '',
      voided_at: null,
    };
    const movement = {
      cliente_id: cliente.id,
      advance_id: advance.id,
      fecha: advance.fecha,
      amount: 50,
      referencia: '',
      notas: '',
    };
    account = {
      cliente,
      pedidos: [
        {
          ...pedido,
          monto_pagado: 50,
          estado_pago: 'parcial',
          pagos: [{ id: body.p_data.applicationId, monto: 50, origen: 'saldo_cliente' }],
        },
      ],
      ingresos: [
        {
          id: advance.ingreso_id,
          cliente_id: cliente.id,
          fecha: advance.fecha,
          descripcion: 'Cobro de prueba',
          monto: 50,
          iva: 0,
          monto_total: 50,
        },
      ],
      advances: [advance],
      movements: [
        { ...movement, id: 'deposit', sequence: 1, kind: 'deposit', operation_id: body.p_operation, pedido_id: null },
        {
          ...movement,
          id: 'application',
          sequence: 2,
          kind: 'apply',
          operation_id: body.p_data.applicationId,
          pedido_id: pedido.id,
          pedido_descripcion: pedido.descripcion,
        },
      ],
    };
    if (calls.length === 1) await route.abort('failed');
    else await route.fulfill({ json: account });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`clientes/cuenta?cliente=${cliente.id}&accion=cobro&pedido=${pedido.id}`);
  const dialog = page.getByRole('dialog', { name: 'Registrar cobro de pedido' });
  await expect(dialog.getByLabel('Importe (MXN)')).toBeEnabled();
  await dialog.getByLabel('Importe (MXN)').fill('50');
  await dialog.getByRole('checkbox').check();
  await page.screenshot({ path: testInfo.outputPath('collection-mobile.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Confirmar movimiento' }).click();
  await dialog.getByRole('button', { name: 'Reintentar confirmacion' }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual(calls[0]);
  expect(genericWrites).toEqual([]);
  await expect(page.locator('dl > div').filter({ hasText: 'Total ingresado' }).locator('dd')).toHaveText('$50.00');
  await expect(page.locator('dl > div').filter({ hasText: 'Saldo a favor disponible' }).locator('dd')).toHaveText(
    '$0.00',
  );
  await expect(page.locator('dl > div').filter({ hasText: 'Pendiente de pedidos' }).locator('dd')).toHaveText('$50.00');
  await page.getByRole('tab', { name: 'Ingresos', exact: true }).click();
  await expect(page.getByText('Cobro de prueba', { exact: true })).toHaveCount(1);
});

test('customer directory paginates aggregates and fits desktop and mobile', async ({ page }, testInfo) => {
  await login(page);
  const pages: number[] = [];
  await page.route('**/rest/v1/rpc/get_customer_directory', async (route) => {
    const query = route.request().postDataJSON();
    pages.push(query.p_page);
    await route.fulfill({
      json: {
        total: 51,
        registered: 60,
        rows: Array.from({ length: query.p_page ? 1 : 50 }, (_, i) => ({
          id: `directory-${query.p_page * 50 + i}`,
          nombre: `Clienta ${query.p_page * 50 + i + 1}`,
          telefono: '',
          email: '',
          created_at: version,
          updated_at: version,
          income_count: 3,
          income_cents: 395000,
          order_count: 2,
          active_order_count: 1,
          pending_cents: 10000,
        })),
      },
    });
  });
  await page.goto('clientes');
  await expect(page.getByRole('article')).toHaveCount(50);
  await page.getByRole('button', { name: 'Página siguiente' }).click();
  await expect(page.getByRole('article', { name: 'Clienta 51' })).toBeVisible();
  expect(pages).toContain(1);
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole('link', { name: 'Registrar adelanto', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`directory-${width}.png`), fullPage: true });
  }
});
test('PDF exports remain available after dependency security updates', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  const cliente = { id: 'pdf-client', nombre: 'Cliente PDF', telefono: '', email: '', updated_at: version };
  const pedido = {
    id: 'pdf-order',
    cliente_id: cliente.id,
    descripcion: 'Uniformes de prueba',
    concepto: 'solo_bordado',
    piezas: 2,
    precio_unitario: 50,
    monto_total: 100,
    monto_pagado: 0,
    costo_materiales: 0,
    estado: 'pendiente',
    estado_pago: 'pendiente',
    pagos: [],
    fotos: [],
    inventario_usado: [],
    maquina: '',
    archivo_diseno: '',
    checklist: {},
    fecha_pedido: '2026-10-22',
    fecha_entrega: '2026-10-25',
    fecha_entrega_real: '',
    urgente: false,
    notas: '',
    updated_at: version,
  };
  // List readers continue until the cursor reaches an empty page.
  await page.route('**/rest/v1/clientes?*', (route) => {
    const after = new URL(route.request().url()).searchParams.get('id')?.startsWith('gt.');
    return route.fulfill({ json: after ? [] : [cliente] });
  });
  await page.route('**/rest/v1/pedidos?*', (route) => {
    const after = new URL(route.request().url()).searchParams.get('id')?.startsWith('gt.');
    return route.fulfill({
      json: after ? [] : [pedido],
      headers: { 'content-range': after ? '*/1' : '0-0/1', 'access-control-expose-headers': 'content-range' },
    });
  });
  await page.route('**/rest/v1/rpc/get_order_summary', (route) =>
    route.fulfill({
      json: {
        activeCount: 1,
        activeTotal: 100,
        statuses: { pendiente: 1 },
        payments: { pendiente: { count: 1, total: 100, paid: 0 } },
      },
    }),
  );
  await page.route('**/rest/v1/rpc/get_customer_account', (route) =>
    route.fulfill({
      json: { cliente, advances: [], movements: [], ingresos: [], pedidos: [pedido] },
    }),
  );
  const downloadPdf = async (name: string, action: () => Promise<void>) => {
    const pending = page.waitForEvent('download');
    await action();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    const path = testInfo.outputPath(`${name}.pdf`);
    await download.saveAs(path);
    const bytes = await readFile(path);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);
  };
  await page.goto('cotizador');
  await downloadPdf('cotizacion', () => page.getByRole('button', { name: 'Descargar PDF', exact: true }).click());
  await page.goto('fiscal');
  await downloadPdf('fiscal', () => page.getByRole('button', { name: 'PDF', exact: true }).click());
  await page.goto('pedidos');
  await page.getByRole('button', { name: 'Más acciones', exact: true }).click();
  await downloadPdf('orden', () => page.getByRole('button', { name: 'Imprimir orden', exact: true }).click());
  await page.goto(`clientes/cuenta?cliente=${cliente.id}`);
  await expect(page.getByRole('heading', { name: 'Cliente PDF', exact: true })).toBeVisible();
  await downloadPdf('estado-cuenta', () => page.getByRole('button', { name: 'PDF', exact: true }).click());
  expect(errors).toEqual([]);
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

test('a cold financial query failure does not display unconfirmed zero balances', async ({ page }) => {
  await login(page);
  await page.evaluate(() => localStorage.removeItem('bordados_egresos'));
  await page.route('**/rest/v1/egresos?*', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"isolated outage"}' }),
  );
  await page.goto('egresos');
  await expect(page.getByText(/Datos sin confirmar/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar consulta' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^egresos$/i })).toBeHidden();
});

test('collections includes delivered debts and prepares a WhatsApp draft on mobile', async ({ page }, testInfo) => {
  await login(page);
  await page.route('**/rest/v1/rpc/get_collections', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total: 2,
        totalPending: 630,
        overduePending: 600,
        overdueCount: 1,
        followupCount: 1,
        rows: [
          {
            id: 'collection-order',
            cliente_id: 'client',
            cliente_nombre: 'Clienta de prueba',
            cliente_telefono: '4441234567',
            descripcion: 'Uniformes entregados',
            estado: 'entregado',
            monto_total: 1000,
            monto_pagado: 400,
            pending: 600,
            payment_due_date: '2026-10-01',
            next_followup_date: '2026-10-10',
            collection_notes: 'Confirmar fecha de pago',
            pagos: [],
            fecha_pedido: '2026-09-01',
            updated_at: version,
          },
          {
            id: 'orphan-order',
            cliente_id: 'missing-client',
            cliente_nombre: null,
            cliente_telefono: null,
            descripcion: 'Pedido con cliente no disponible',
            estado: 'aprobado',
            monto_total: 30,
            monto_pagado: 0,
            pending: 30,
            pagos: [],
            fecha_pedido: '2026-09-01',
            updated_at: version,
          },
        ],
      }),
    }),
  );
  await page.goto('cobranza');
  await expect(page.getByRole('heading', { name: 'Cobranza' })).toBeVisible();
  await expect(page.getByText('Uniformes entregados')).toBeVisible();
  await expect(page.getByText('Cliente no disponible', { exact: true })).toBeVisible();
  await expect(page.locator('a[href*="missing-client"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'WhatsApp a Clienta de prueba' })).toHaveAttribute(
    'href',
    /wa.me\/524441234567/,
  );
  await page.getByRole('button', { name: 'Seguimiento de Uniformes entregados' }).click();
  await expect(page.getByLabel('Vencimiento de pago')).toHaveValue('2026-10-01');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('collections-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Abrir menú' })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'WhatsApp a Clienta de prueba' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Seguimiento de Uniformes entregados' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('collections-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('order pagination requests only the selected server page and preserves global totals', async ({ page }) => {
  await login(page);
  const offsets: number[] = [];
  await page.route('**/rest/v1/pedidos?*', async (route) => {
    const url = new URL(route.request().url());
    const offset = Number(url.searchParams.get('offset') || 0);
    offsets.push(offset);
    const rows = Array.from({ length: Math.min(50, 52 - offset) }, (_, index) => ({
      id: `order-${offset + index}`,
      cliente_id: '',
      descripcion: `Pedido paginado ${offset + index + 1}`,
      piezas: 1,
      precio_unitario: 1000,
      monto_total: 1000,
      monto_pagado: 0,
      pagos: [],
      estado: 'pendiente',
      estado_pago: 'pendiente',
      urgente: false,
      fecha_pedido: '2026-10-01',
      updated_at: version,
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'content-range': `${offset}-${offset + rows.length - 1}/52`,
        'access-control-expose-headers': 'content-range',
      },
      body: JSON.stringify(rows),
    });
  });
  await page.route('**/rest/v1/rpc/get_order_summary', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        activeCount: 52,
        activeTotal: 52000,
        statuses: { pendiente: 52 },
        payments: { pendiente: { count: 52, total: 52000, paid: 0 } },
      }),
    }),
  );
  await page.goto('pedidos');
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await expect(page.getByText('1–50 de 52')).toBeVisible();
  expect(offsets).not.toContain(50);
  await page.getByRole('button', { name: 'Página siguiente' }).click();
  await expect(page.getByText('51–52 de 52')).toBeVisible();
  await expect(page.getByText('Pedido paginado 52', { exact: true })).toBeVisible();
  expect(offsets).toContain(50);
});

test('reports reserve only earned net receipts and show outstanding advances separately', async ({
  page,
}, testInfo) => {
  await login(page);
  const year = new Date().getFullYear();
  const fecha = `${year}-10-02`;
  const income = [
    {
      id: 'advance-income',
      descripcion: 'Adelanto',
      fecha,
      monto: 1000,
      monto_total: 1000,
      iva: 0,
      factura: false,
      concepto: 'otro',
    },
    {
      id: 'sale-income',
      descripcion: 'Venta',
      fecha,
      monto: 500,
      monto_total: 500,
      iva: 0,
      factura: false,
      concepto: 'otro',
    },
  ];
  const expense = [
    {
      id: 'expense',
      descripcion: 'Materiales',
      fecha,
      monto: 100,
      monto_total: 116,
      iva: 16,
      factura: true,
      categoria: 'insumos',
    },
  ];
  for (const [table, rows] of [
    ['ingresos', income],
    ['egresos', expense],
  ] as const) {
    await page.route(`**/rest/v1/${table}?*`, async (route) => {
      const url = new URL(route.request().url());
      const after = url.searchParams.get('id')?.replace(/^gt\./, '') || '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rows.filter((row) => row.id > after)),
      });
    });
  }
  await page.route('**/rest/v1/rpc/get_advance_report', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        Array.from({ length: 12 }, (_, index) => ({
          month: `${year}-${String(index + 1).padStart(2, '0')}`,
          received: index === 9 ? 1000 : 0,
          receivedNet: index === 9 ? 1000 : 0,
          appliedNet: 0,
          available: index >= 9 ? 1000 : 0,
          assigned: 0,
        })),
      ),
    }),
  );
  await page.goto('reportes');
  await expect(page.getByText('Adelantos recibidos en el periodo')).toBeVisible();
  await expect(page.getByText('$1,500.00', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('$400.00', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('$40.00', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('$8.00', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('operating-report-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('operating-report-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
