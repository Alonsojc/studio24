import type { Cliente, ConfigNegocio } from './types';
import {
  advanceBalance,
  buildCustomerStatement,
  movementLabel,
  type CustomerAccount,
  type CustomerStatement,
} from './customer-accounts';
import { formatCurrency } from './helpers';

export interface AccountExport {
  cliente: Cliente;
  business: Pick<ConfigNegocio, 'nombreNegocio'>;
  account: CustomerAccount;
  statement: CustomerStatement;
}
const clean = (value: string) => value.replace(/[\u0000-\u001f]/g, ' ');
export const advanceFolio = (id: string, folio?: number) =>
  folio ? `AD-${String(folio).padStart(6, '0')}` : `AD-${id.slice(0, 4).toUpperCase()}-${id.slice(-8).toUpperCase()}`;
export const accountFileName = (cliente: Cliente, extension: string) =>
  `estado-cuenta-${cliente.nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .slice(0, 60)}.${extension}`;

export async function createCustomerAccountPdf(input: AccountExport) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const { statement, cliente, business, account } = input;
  const width = doc.internal.pageSize.getWidth();
  const right = width - 14;
  const bottom = doc.internal.pageSize.getHeight() - 18;
  let y = 18;
  const line = () => {
    doc.setDrawColor(225);
    doc.line(14, y, right, y);
  };
  const page = () => {
    doc.addPage();
    y = 18;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const title: string[] = doc.splitTextToSize('Estado de cuenta - ' + clean(cliente.nombre), right - 14);
    doc.text(title, 14, y);
    y += title.length * 4 + 6;
  };
  const space = (height: number) => {
    if (y + height > bottom) page();
  };
  const textBlock = (text: string, size = 9) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    const lines: string[] = doc.splitTextToSize(clean(text), right - 14);
    for (const textLine of lines) {
      space(5);
      doc.text(textLine, 14, y);
      y += 4.5;
    }
  };
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  const company: string[] = doc.splitTextToSize(clean(business.nombreNegocio || 'Studio 24'), right - 14);
  doc.text(company, 14, y);
  y += company.length * 6 + 3;
  doc.setFontSize(12);
  doc.text('ESTADO DE CUENTA', 14, y);
  y += 8;
  textBlock(cliente.nombre, 11);
  if (cliente.email || cliente.telefono) textBlock([cliente.email, cliente.telefono].filter(Boolean).join(' | '));
  textBlock(`Periodo: ${statement.from || 'Inicio'} a ${statement.to || 'Hoy'} | Moneda: MXN`);
  y += 3;
  textBlock(
    `Saldo al inicio: ${formatCurrency(statement.opening)}   |   Saldo al cierre: ${formatCurrency(statement.closing)}`,
  );
  textBlock(`Pendiente de pedidos hoy: ${formatCurrency(statement.outstanding)}`);
  y += 5;
  const headers = () => {
    space(12);
    doc.setFillColor(242, 243, 245);
    doc.rect(14, y - 4, right - 14, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Fecha', 16, y);
    doc.text('Movimiento / referencia / pedido', 39, y);
    doc.text('Abonos', 145, y, { align: 'right' });
    doc.text('Aplicado', 173, y, { align: 'right' });
    doc.text('Saldo', right - 2, y, { align: 'right' });
    y += 9;
  };
  headers();
  for (const row of statement.rows) {
    const details = [
      movementLabel[row.kind],
      row.referencia,
      row.pedidoDescripcion,
      advanceFolio(row.advanceId, account.advances.find((advance) => advance.id === row.advanceId)?.folio),
      row.notas,
    ]
      .filter(Boolean)
      .join(' | ');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const lines: string[] = doc.splitTextToSize(clean(details), 78);
    let first = true;
    while (lines.length) {
      if (y + Math.min(2, lines.length) * 4 + 8 > bottom) {
        page();
        headers();
      }
      const fit = Math.max(1, Math.floor((bottom - y - 8) / 4));
      const part = lines.splice(0, fit);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      if (first) {
        doc.text(row.fecha, 16, y);
        if (row.credit) doc.text(formatCurrency(row.credit), 145, y, { align: 'right' });
        if (row.debit) doc.text(formatCurrency(row.debit), 173, y, { align: 'right' });
        doc.text(formatCurrency(row.balance), right - 2, y, { align: 'right' });
      }
      doc.text(part, 39, y);
      y += Math.max(10, part.length * 4 + 4);
      line();
      y += 4;
      first = false;
      if (lines.length) {
        page();
        headers();
      }
    }
  }
  if (!statement.rows.length) textBlock('Sin movimientos en el periodo seleccionado.');
  y += 5;
  space(18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Adelantos al corte', 14, y);
  y += 8;
  const asOf = account.movements.filter((movement) => !statement.to || movement.fecha <= statement.to);
  for (const advance of account.advances.filter((advance) => !statement.to || advance.fecha <= statement.to)) {
    space(16);
    const available = advanceBalance(advance.id, asOf);
    textBlock(
      `${advanceFolio(advance.id, advance.folio)} | ${advance.fecha} | Recibido ${formatCurrency(advance.amount)} | Disponible ${formatCurrency(available)}`,
    );
    if (advance.referencia) textBlock(`Referencia: ${advance.referencia}`, 8);
  }
  const count = doc.getNumberOfPages();
  for (let index = 1; index <= count; index++) {
    doc.setPage(index);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(110);
    doc.text('Documento de control interno. No es comprobante fiscal.', 14, doc.internal.pageSize.getHeight() - 9);
    doc.text(`${index} / ${count}`, right, doc.internal.pageSize.getHeight() - 9, { align: 'right' });
  }
  return doc;
}

export async function createCustomerAccountExcel(input: AccountExport): Promise<Blob> {
  const { default: writeExcelFile } = await import('write-excel-file/universal');
  const { statement, cliente, business, account } = input;
  const header = (value: string) => ({
    value,
    fontWeight: 'bold' as const,
    backgroundColor: '#202328',
    textColor: '#FFFFFF',
    wrap: true,
    height: 28,
  });
  const money = (value: number) => ({
    value,
    type: Number,
    format: '"$"#,##0.00;[Red]("$"#,##0.00)',
    align: 'right' as const,
  });
  const date = (value: string) => ({ value: new Date(value + 'T12:00:00Z'), type: Date, format: 'dd/mm/yyyy' });
  const text = (value: string) => ({ value, type: String, wrap: true });
  const movements = [
    [
      {
        value: business.nombreNegocio || 'Studio 24',
        fontWeight: 'bold' as const,
        fontSize: 16,
        columnSpan: 6,
        height: 26,
      },
      null,
      null,
      null,
      null,
      null,
    ],
    [
      { value: 'Estado de cuenta', columnSpan: 2 },
      null,
      { ...text(cliente.nombre), columnSpan: 9 },
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ],
    ['Desde', statement.from || 'Inicio', 'Hasta', statement.to || 'Hoy', 'Moneda', 'MXN'],
    [
      { value: 'Saldo inicial', columnSpan: 3 },
      null,
      null,
      money(statement.opening),
      { value: 'Saldo al cierre', columnSpan: 2 },
      null,
      money(statement.closing),
    ],
    [{ value: 'Pendiente de pedidos hoy', columnSpan: 3 }, null, null, money(statement.outstanding)],
    [],
    [
      'Fecha',
      'Movimiento',
      'Referencia',
      'Adelanto',
      'Pedido',
      'Abonos / reintegros',
      'Aplicado / anulado',
      'Saldo',
      'Notas',
      'ID movimiento',
      'ID pedido',
    ].map(header),
    ...statement.rows.map((row) => [
      date(row.fecha),
      movementLabel[row.kind],
      text(row.referencia),
      advanceFolio(row.advanceId, account.advances.find((advance) => advance.id === row.advanceId)?.folio),
      text(row.pedidoDescripcion),
      money(row.credit),
      money(row.debit),
      money(row.balance),
      text(row.notas),
      row.id,
      row.pedidoId || '',
    ]),
  ];
  const asOf = account.movements.filter((movement) => !statement.to || movement.fecha <= statement.to);
  const advances = [
    [{ value: 'Adelantos al corte', columnSpan: 2, fontWeight: 'bold' as const }, null, statement.to || 'Hoy'],
    [
      'Folio',
      'Fecha',
      'Referencia',
      'Recibido',
      'Aplicado neto',
      'Disponible',
      'Anulado',
      'Origen',
      'ID ingreso',
      'ID adelanto',
    ].map(header),
    ...account.advances
      .filter((advance) => !statement.to || advance.fecha <= statement.to)
      .map((advance) => {
        const entries = asOf.filter((movement) => movement.advanceId === advance.id);
        const applied =
          entries.reduce(
            (sum, row) =>
              sum +
              (row.kind === 'apply'
                ? Math.round(row.amount * 100)
                : row.kind === 'reverse_application'
                  ? -Math.round(row.amount * 100)
                  : 0),
            0,
          ) / 100;
        return [
          advanceFolio(advance.id, advance.folio),
          date(advance.fecha),
          advance.referencia,
          money(advance.amount),
          money(applied),
          money(advanceBalance(advance.id, asOf)),
          entries.some((row) => row.kind === 'cancel') ? 'Si' : 'No',
          advance.source === 'existing' ? 'Ingreso existente' : 'Nuevo cobro',
          advance.ingresoId,
          advance.id,
        ];
      }),
  ];
  return writeExcelFile([
    {
      sheet: 'Estado de cuenta',
      data: movements,
      stickyRowsCount: 7,
      columns: [14, 26, 24, 18, 40, 22, 22, 20, 45, 40, 40].map((width) => ({ width })),
    },
    {
      sheet: 'Adelantos al corte',
      data: advances,
      stickyRowsCount: 2,
      columns: [18, 14, 26, 20, 20, 20, 14, 22, 40, 40].map((width) => ({ width })),
    },
  ]).toBlob();
}
export function downloadAccountFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export { buildCustomerStatement };
