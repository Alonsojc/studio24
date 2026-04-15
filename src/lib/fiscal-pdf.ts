'use client';

import jsPDF from 'jspdf';
import type { MonthFiscalData } from './fiscal';

function fmt(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
}

interface PDFOptions {
  nombreNegocio: string;
  rfc: string;
  regimenFiscal: string;
  perdidaArrastrable: number;
  perdidaAcum: number;
  ivaFavorAcum: number;
  acumIngresosFacturados: number;
  acumIVAPorPagar: number;
  acumISR: number;
  acumTotalImpuestos: number;
}

export function generateFiscalPDF(year: number, monthData: MonthFiscalData[], opts: PDFOptions) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 12;
  let y = margin;

  // --- Header ---
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(opts.nombreNegocio || 'Studio 24', margin, y + 6);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120);
  const headerRight = [];
  if (opts.rfc) headerRight.push(`RFC: ${opts.rfc}`);
  if (opts.regimenFiscal) headerRight.push(`Régimen: ${opts.regimenFiscal}`);
  headerRight.push(`Generado: ${new Date().toLocaleDateString('es-MX')}`);
  doc.text(headerRight.join('  |  '), pageW - margin, y + 6, { align: 'right' });

  y += 12;
  doc.setDrawColor(200);
  doc.line(margin, y, pageW - margin, y);
  y += 5;

  // --- Title ---
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(`Resumen Fiscal ${year}`, margin, y + 5);
  y += 10;

  // --- Summary cards ---
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);

  const cards = [
    { label: 'Facturado Anual', value: fmt(opts.acumIngresosFacturados) },
    { label: 'IVA Pagado', value: fmt(opts.acumIVAPorPagar) },
    { label: 'ISR Pagado', value: fmt(opts.acumISR) },
    { label: 'Total Impuestos', value: fmt(opts.acumTotalImpuestos) },
  ];
  if (opts.perdidaArrastrable > 0) {
    cards.push({ label: 'Pérdida Ej. Anteriores', value: fmt(opts.perdidaArrastrable) });
  }
  if (opts.perdidaAcum > 0) {
    cards.push({ label: 'Pérdida del Ejercicio', value: fmt(opts.perdidaAcum) });
  }
  if (opts.ivaFavorAcum > 0) {
    cards.push({ label: 'IVA a Favor', value: fmt(opts.ivaFavorAcum) });
  }

  const cardW = (pageW - margin * 2) / Math.min(cards.length, 5);
  cards.forEach((card, i) => {
    const cx = margin + (i % 5) * cardW;
    const cy = y + Math.floor(i / 5) * 14;
    doc.setFontSize(7);
    doc.setTextColor(130);
    doc.text(card.label.toUpperCase(), cx + 2, cy + 4);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30);
    doc.text(card.value, cx + 2, cy + 10);
    doc.setFont('helvetica', 'normal');
  });
  y += Math.ceil(cards.length / 5) * 14 + 4;

  // --- Monthly table ---
  doc.setDrawColor(200);
  doc.line(margin, y, pageW - margin, y);
  y += 5;

  const cols = [
    { label: 'Mes', w: 22 },
    { label: 'Ing. Fact.', w: 22 },
    { label: 'Eg. Deduc.', w: 22 },
    { label: 'IVA Trasl.', w: 20 },
    { label: 'IVA Acred.', w: 20 },
    { label: 'IVA Pagar', w: 20 },
    { label: 'Utilidad', w: 22 },
    { label: 'Pérd. Ant.', w: 20 },
    { label: 'Base ISR', w: 22 },
    { label: 'ISR', w: 20 },
    { label: 'Total Imp.', w: 22 },
  ];

  // Header row
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100);
  let cx = margin;
  cols.forEach((col) => {
    doc.text(col.label, cx + 1, y + 3);
    cx += col.w;
  });
  y += 5;
  doc.setDrawColor(230);
  doc.line(margin, y, pageW - margin, y);
  y += 1;

  // Data rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

  monthData.forEach((b, idx) => {
    const rowY = y + idx * 5.5;
    if (idx % 2 === 0) {
      doc.setFillColor(248, 248, 248);
      doc.rect(margin, rowY - 1, pageW - margin * 2, 5.5, 'F');
    }
    doc.setTextColor(60);
    let rx = margin;
    const vals = [
      b.label.substring(0, 3),
      fmt(b.ingresosFacturados),
      fmt(b.egresosDeducibles),
      fmt(b.ivaTrasladado),
      fmt(b.ivaAcreditable),
      fmt(b.ivaPorPagar),
      fmt(b.utilidadMes),
      fmt(b.perdidaAnterior + b.perdidaEjerciciosAnteriores),
      fmt(b.baseISR),
      fmt(b.isrEstimado),
      fmt(b.totalImpuestos),
    ];
    vals.forEach((v, vi) => {
      doc.text(v, rx + 1, rowY + 3);
      rx += cols[vi].w;
    });
  });

  y += 12 * 5.5 + 2;

  // Total row
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, y - 1, pageW - margin * 2, 6, 'F');
  doc.setTextColor(30);
  let tx = margin;
  const totals = [
    'TOTAL',
    fmt(opts.acumIngresosFacturados),
    fmt(monthData.reduce((s, b) => s + b.egresosDeducibles, 0)),
    fmt(monthData.reduce((s, b) => s + b.ivaTrasladado, 0)),
    fmt(monthData.reduce((s, b) => s + b.ivaAcreditable, 0)),
    fmt(opts.acumIVAPorPagar),
    fmt(monthData.reduce((s, b) => s + b.utilidadMes, 0)),
    '',
    '',
    fmt(opts.acumISR),
    fmt(opts.acumTotalImpuestos),
  ];
  totals.forEach((v, vi) => {
    doc.text(v, tx + 1, y + 3.5);
    tx += cols[vi].w;
  });

  y += 12;

  // --- Footer ---
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(160);
  doc.text(
    'Estimaciones basadas en Art. 96 LISR (ISR) y Ley del IVA. Pérdidas arrastradas según Art. 57 LISR. Consulte con su contador.',
    margin,
    y + 3,
  );

  doc.save(`fiscal_${year}_${opts.nombreNegocio || 'studio24'}.pdf`);
}
