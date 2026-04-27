import { expect, test, type Page } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000/';

function appUrl(path = ''): string {
  return new URL(path.replace(/^\//, ''), baseURL.endsWith('/') ? baseURL : `${baseURL}/`).toString();
}

async function login(page: Page, email?: string, password?: string): Promise<void> {
  test.skip(!email || !password, 'Define credenciales E2E para correr esta prueba.');
  await page.goto(appUrl());
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Contraseña').fill(password);
  await page.getByRole('button', { name: /iniciar sesión/i }).click();
  await expect(page.getByText(/DASHBOARD|PEDIDOS|PRODUCCIÓN/i).first()).toBeVisible();
}

async function createCliente(page: Page, name: string): Promise<void> {
  await page.goto(appUrl('clientes'));
  await page.getByRole('button', { name: /\+ nuevo cliente|\+ agregar cliente/i }).first().click();
  await page.getByPlaceholder(/nombre completo/i).fill(name);
  await page.getByRole('button', { name: /agregar/i }).click();
  await expect(page.getByText(name)).toBeVisible();
}

async function createPedido(page: Page, pedidoName: string, clienteName: string, precio = '100'): Promise<void> {
  await page.goto(appUrl('pedidos'));
  await page.getByRole('button', { name: /\+ nuevo/i }).click();
  await page.getByPlaceholder(/20 playeras/i).fill(pedidoName);
  await page.getByRole('combobox').first().selectOption({ label: clienteName });
  await page.locator('input[type="number"]').nth(0).fill('1');
  await page.locator('input[type="number"]').nth(1).fill(precio);
  await page.getByRole('button', { name: /crear pedido/i }).click();
  await expect(page.getByText(pedidoName)).toBeVisible();
}

test('carga el login en producción/local', async ({ page }) => {
  await page.goto(appUrl());
  await expect(page.getByPlaceholder('Email')).toBeVisible();
  await expect(page.getByPlaceholder('Contraseña')).toBeVisible();
  await expect(page.getByRole('button', { name: /iniciar sesión/i })).toBeVisible();
});

test('login y logout funcionan', async ({ page }) => {
  await login(page, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD);
  await page.getByTitle('Cerrar sesión').click();
  await expect(page.getByRole('button', { name: /iniciar sesión/i })).toBeVisible();
});

test('rol operador queda bloqueado en finanzas', async ({ page }) => {
  await login(page, process.env.E2E_OPERADOR_EMAIL, process.env.E2E_OPERADOR_PASSWORD);
  await page.goto(appUrl('ingresos'));
  await expect(page.getByText('Acceso restringido')).toBeVisible();
});

test('rol contador queda bloqueado en pedidos', async ({ page }) => {
  await login(page, process.env.E2E_CONTADOR_EMAIL, process.env.E2E_CONTADOR_PASSWORD);
  await page.goto(appUrl('pedidos'));
  await expect(page.getByText('Acceso restringido')).toBeVisible();
});

test('pedido pagado no permite duplicar ingreso', async ({ page }) => {
  test.skip(process.env.E2E_ALLOW_MUTATIONS !== '1', 'Activa E2E_ALLOW_MUTATIONS=1 para crear datos temporales.');
  await login(page, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD);
  const pedidoName = `E2E pedido pagado ${Date.now()}`;
  const clienteName = `E2E cliente ${Date.now()}`;

  await createCliente(page, clienteName);
  await page.goto(appUrl('pedidos'));
  await page.getByRole('button', { name: /\+ nuevo/i }).click();
  await page.getByPlaceholder(/20 playeras/i).fill(pedidoName);
  await page.getByRole('combobox').first().selectOption({ label: clienteName });
  await page.locator('input[type="number"]').nth(0).fill('1');
  await page.locator('input[type="number"]').nth(1).fill('100');
  await page.locator('input[type="number"]').nth(2).fill('100');
  await page.getByRole('button', { name: /crear pedido/i }).click();

  await page.getByRole('button', { name: 'Pagos' }).click();
  await expect(page.getByText(pedidoName)).toBeVisible();

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });
  const row = page.getByRole('row').filter({ hasText: pedidoName });
  await row.getByLabel('Más acciones').click();
  await page.getByRole('button', { name: 'Crear Ingreso' }).click();
  await expect(page.getByText(pedidoName)).toBeVisible();

  await row.getByLabel('Más acciones').click();
  await expect(page.getByRole('button', { name: 'Crear Ingreso' })).toHaveCount(0);
});

test('subida de foto en pedido queda disponible', async ({ page }) => {
  test.skip(process.env.E2E_ALLOW_MUTATIONS !== '1', 'Activa E2E_ALLOW_MUTATIONS=1 para subir archivos temporales.');
  await login(page, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD);
  const pedidoName = `E2E foto ${Date.now()}`;
  const clienteName = `E2E cliente foto ${Date.now()}`;
  await createCliente(page, clienteName);
  await createPedido(page, pedidoName, clienteName, '50');

  const addPhoto = page.getByRole('button', { name: /\+ agregar foto/i }).first();
  await expect(addPhoto).toBeVisible();
  await addPhoto.click();
  await page
    .locator('input[type="file"][accept="image/*"]')
    .first()
    .setInputFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
        'base64',
      ),
    });
  await expect(page.getByText(/subiendo|foto del pedido|sin fotos/i).first()).toBeVisible();
});

test('subida de factura acepta XML CFDI en la bandeja', async ({ page }) => {
  await login(page, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD);
  await page.goto(appUrl('facturas'));
  await page.getByRole('button', { name: /\+ subir xmls \/ pdfs/i }).click();
  await page.locator('input[type="file"][accept=".xml,.pdf"]').setInputFiles({
    name: 'cfdi-e2e.xml',
    mimeType: 'application/xml',
    buffer: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Fecha="2026-04-27T10:00:00" SubTotal="100.00" Total="116.00" Moneda="MXN" FormaPago="03" MetodoPago="PUE" TipoDeComprobante="I">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="EMISOR E2E"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="RECEPTOR E2E" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto Descripcion="Bordado E2E" Cantidad="1" ValorUnitario="100.00" Importe="100.00"/>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="16.00">
    <cfdi:Traslados><cfdi:Traslado Impuesto="002" Importe="16.00"/></cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento><tfd:TimbreFiscalDigital UUID="E2E-UUID-FACTURA"/></cfdi:Complemento>
</cfdi:Comprobante>`),
  });
  await expect(page.getByText(/E2E-UUID-FACTURA|Factura emitida|Bordado E2E/i).first()).toBeVisible();
});
