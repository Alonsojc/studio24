'use client';

import { useState, useRef } from 'react';
import { v4 as uuid } from 'uuid';
import { getIngresos, getEgresos, getConfig, getProveedores } from '@/lib/store';
import { cloudGetIngresosByYear, cloudGetEgresosByYear } from '@/lib/store-cloud';
import { useCloudStore } from '@/lib/useCloudStore';
import { updateEgreso, updateProveedor } from '@/lib/store-sync';
import { formatCurrency, formatDate } from '@/lib/helpers';
import { parseXMLFile, type DatosCFDI } from '@/lib/cfdi';
import { openFacturaFile } from '@/lib/cfdi-storage';
import { invoiceCandidates, normalizedUuid } from '@/lib/invoice-matching';
import { saveImportedInvoice } from '@/lib/invoice-import';
import {
  clasificarDeducibilidad,
  tipoDeduccionLabel,
  tipoDeduccionColor,
  type ResultadoDeducibilidad,
} from '@/lib/deducibilidad';
import PageHeader from '@/components/PageHeader';
import MonthBar from '@/components/MonthBar';
import ActionMenu from '@/components/ActionMenu';
import { btnPrimary } from '@/lib/styles';

interface FacturaPendiente {
  id: string;
  cfdi: DatosCFDI;
  xmlFile: File;
  pdfFile?: File;
  tipo: 'ingreso' | 'egreso';
  matchId?: string;
  matchDesc?: string;
  deducibilidad?: ResultadoDeducibilidad;
  status: 'pending' | 'matched' | 'new' | 'attach' | 'done' | 'error';
  error?: string;
  retryStatus?: 'pending' | 'matched' | 'new' | 'attach';
}

export default function FacturasPage() {
  const now = new Date();
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState<string>(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  );
  const { data: ingresos } = useCloudStore(getIngresos, () => cloudGetIngresosByYear(filterYear), 'bordados_ingresos', [
    filterYear,
  ]);
  const { data: egresos, reload: reloadEgresos } = useCloudStore(
    getEgresos,
    () => cloudGetEgresosByYear(filterYear),
    'bordados_egresos',
    [filterYear],
  );
  const [config] = useState(getConfig);
  const [facturas, setFacturas] = useState<FacturaPendiente[]>([]);
  const [processing, setProcessing] = useState(false);
  const [duplicadas, setDuplicadas] = useState(0);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [filterTipo, setFilterTipo] = useState<'all' | 'ingreso' | 'egreso'>('all');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const xmlFiles = files.filter((f) => /\.xml$/i.test(f.name));
    const pdfFiles = files.filter((f) => /\.pdf$/i.test(f.name));
    const errors: string[] = [];

    const nuevas: FacturaPendiente[] = [];
    let skipped = 0;
    // Track IDs already matched in this batch to prevent two XMLs from claiming the same record
    const batchMatchedIds = new Set<string>(facturas.filter((f) => f.matchId).map((f) => f.matchId!));

    for (const xmlFile of xmlFiles) {
      const cfdi = await parseXMLFile(xmlFile);
      if (!cfdi || !cfdi.uuid || cfdi.tipoComprobante !== 'I' || cfdi.moneda !== 'MXN') {
        errors.push(`${xmlFile.name}: se requiere un CFDI de ingreso timbrado en MXN.`);
        continue;
      }
      const ownRfc = normalizedUuid(config?.rfc);
      if (ownRfc && ![cfdi.rfcEmisor, cfdi.rfcReceptor].some((rfc) => normalizedUuid(rfc) === ownRfc)) {
        errors.push(`${xmlFile.name}: el RFC del negocio no aparece en la factura.`);
        continue;
      }

      // Find matching PDF by similar name (used in all flows)
      const baseName = xmlFile.name.replace(/\.xml$/i, '').toLowerCase();
      const pdfFile = pdfFiles.find((p) => p.name.replace(/\.pdf$/i, '').toLowerCase() === baseName);

      // Skip if this same CFDI is already queued in the current session
      const alreadyInBatch =
        cfdi.uuid && [...nuevas, ...facturas].some((f) => normalizedUuid(f.cfdi.uuid) === normalizedUuid(cfdi.uuid));
      if (alreadyInBatch) {
        skipped++;
        continue;
      }

      // Only a matching UUID identifies the same invoice.
      let existing: { id: string; descripcion: string; xmlUrl?: string; pdfUrl?: string } | null = null;
      let existingTipo: 'ingreso' | 'egreso' | null = null;
      if (cfdi.uuid) {
        const ing = ingresos.find((i) => normalizedUuid(i.uuidCFDI) === normalizedUuid(cfdi.uuid));
        if (ing) {
          existing = ing;
          existingTipo = 'ingreso';
        } else {
          const eg = egresos.find((e) => normalizedUuid(e.uuidCFDI) === normalizedUuid(cfdi.uuid));
          if (eg) {
            existing = eg;
            existingTipo = 'egreso';
          }
        }
      }

      if (existing && existingTipo) {
        // If the record already has both files we want, it's a true duplicate.
        const canUploadXml = !existing.xmlUrl;
        const canUploadPdf = Boolean(pdfFile && !existing.pdfUrl);
        if (!canUploadXml && !canUploadPdf) {
          skipped++;
          continue;
        }
        // Otherwise queue it as attach-only: upload files, don't rewrite the record.
        nuevas.push({
          id: uuid(),
          cfdi,
          xmlFile,
          pdfFile,
          tipo: existingTipo,
          matchId: existing.id,
          matchDesc: existing.descripcion,
          status: 'attach',
        });
        continue;
      }

      // Determine if it's an ingreso (Isabel emitted) or egreso (Isabel received)
      // Compare RFC first (most reliable), then name
      const miRFC = (config?.rfc || '').toUpperCase();
      const miNombre = (config?.titular || '').toLowerCase();

      let tipo: 'ingreso' | 'egreso';
      if (miRFC && cfdi.rfcEmisor.toUpperCase() === miRFC) {
        tipo = 'ingreso'; // Isabel is the emisor → she sold something
      } else if (miRFC && cfdi.rfcReceptor.toUpperCase() === miRFC) {
        tipo = 'egreso'; // Isabel is the receptor → she bought something
      } else if (miNombre && cfdi.nombreEmisor.toLowerCase().includes(miNombre)) {
        tipo = 'ingreso';
      } else if (miNombre && cfdi.nombreReceptor.toLowerCase().includes(miNombre)) {
        tipo = 'egreso';
      } else {
        tipo = 'egreso'; // Default: assume it's a purchase
      }

      // Try to find a match in existing records (excluding IDs already claimed in this batch)
      const candidates = invoiceCandidates(
        cfdi,
        tipo === 'ingreso' ? ingresos : egresos,
        batchMatchedIds,
        getProveedores(),
      );

      // Auto-classify deducibility for egresos
      const descConceptos = cfdi.conceptos.map((c) => c.descripcion).join(' ');
      const deducibilidad = tipo === 'egreso' ? clasificarDeducibilidad(cfdi.usoCFDI, descConceptos) : undefined;

      nuevas.push({
        id: uuid(),
        cfdi,
        xmlFile,
        pdfFile,
        tipo,
        deducibilidad,
        status: candidates.length ? 'pending' : 'new',
      });
    }

    setFacturas((prev) => [...prev, ...nuevas]);
    setUploadErrors(errors);
    if (skipped > 0) setDuplicadas(skipped);
    if (fileRef.current) fileRef.current.value = '';
  };

  const processAll = async () => {
    if (processing) return;
    setProcessing(true);
    const updated = facturas.map((f) => ({ ...f }));
    const claimed = new Set<string>();
    for (let i = 0; i < updated.length; i++) {
      const f = updated[i];
      const mode = f.status === 'error' ? f.retryStatus || 'new' : f.status;
      if (mode === 'pending' || mode === 'done') continue;
      if (f.matchId && claimed.has(f.matchId)) {
        updated[i] = { ...f, status: 'pending', matchId: undefined };
        continue;
      }
      if (f.matchId) claimed.add(f.matchId);
      try {
        await saveImportedInvoice({ ...f, mode });
        updated[i] = { ...f, status: 'done', error: undefined };
        const egreso = f.tipo === 'egreso' ? getEgresos().find((row) => row.id === (f.matchId || f.id)) : undefined;
        const proveedor = egreso && getProveedores().find((row) => row.id === egreso.proveedorId);
        if (proveedor && !proveedor.rfc) updateProveedor({ ...proveedor, rfc: f.cfdi.rfcEmisor.toUpperCase() });
      } catch (error) {
        updated[i] = {
          ...f,
          status: 'error',
          retryStatus: mode,
          error: error instanceof Error ? error.message : 'No se pudo guardar la factura.',
        };
      }
    }
    setFacturas(updated);
    setProcessing(false);
  };

  const removeFactura = (id: string) => {
    setFacturas((prev) => prev.filter((f) => f.id !== id));
  };

  const toggleSoloFiscal = (id: string) => {
    const egreso = egresos.find((e) => e.id === id);
    if (!egreso) return;
    updateEgreso({ ...egreso, soloFiscal: !egreso.soloFiscal });
    reloadEgresos();
  };

  const toggleTipo = (id: string) => {
    setFacturas((prev) => {
      // Collect IDs already matched by other facturas
      return prev.map((f) => {
        if (f.id !== id || f.status === 'attach' || f.status === 'done') return f;
        const nuevoTipo = f.tipo === 'ingreso' ? ('egreso' as const) : ('ingreso' as const);
        return { ...f, tipo: nuevoTipo, matchId: undefined, matchDesc: undefined, status: 'pending' };
      });
    });
  };

  const pendientes = facturas.filter((f) => f.status !== 'done');
  // Facturas ya vinculadas (persisten entre navegaciones)
  const facturasVinculadas = [
    ...ingresos
      .filter((i) => i.uuidCFDI)
      .map((i) => ({
        id: i.id,
        tipo: 'ingreso' as const,
        desc: i.descripcion,
        total: i.montoTotal,
        uuid: i.uuidCFDI!,
        fecha: i.fecha,
        montoTotal: i.montoTotal,
        xmlUrl: i.xmlUrl || '',
        pdfUrl: i.pdfUrl || '',
        soloFiscal: false,
      })),
    ...egresos
      .filter((e) => e.uuidCFDI)
      .map((e) => ({
        id: e.id,
        tipo: 'egreso' as const,
        desc: e.descripcion,
        total: e.montoTotal,
        uuid: e.uuidCFDI!,
        fecha: e.fecha,
        montoTotal: e.montoTotal,
        xmlUrl: e.xmlUrl || '',
        pdfUrl: e.pdfUrl || '',
        soloFiscal: Boolean(e.soloFiscal),
      })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));

  // Available years across all facturas (plus current year)
  const facturaYears = Array.from(
    new Set([...facturasVinculadas.map((f) => parseInt(f.fecha.substring(0, 4), 10)), now.getFullYear()]),
  )
    .sort()
    .reverse();

  // Apply tipo + month/year filter
  const facturasVisible = facturasVinculadas.filter((f) => {
    if (filterTipo !== 'all' && f.tipo !== filterTipo) return false;
    if (filterMonth === 'all') {
      if (!f.fecha.startsWith(String(filterYear) + '-')) return false;
    } else {
      if (!f.fecha.startsWith(filterMonth)) return false;
    }
    return true;
  });

  // MonthBar items reflect the tipo filter but ignore the month filter
  const monthBarItems = facturasVinculadas.filter((f) => filterTipo === 'all' || f.tipo === filterTipo);
  const monthBarColor: 'green' | 'red' = filterTipo === 'egreso' ? 'red' : 'green';

  return (
    <div>
      <PageHeader
        title="Facturas"
        description="Comprobantes emitidos y recibidos"
        action={
          <button onClick={() => fileRef.current?.click()} className={btnPrimary}>
            + Subir XMLs / PDFs
          </button>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept=".xml,.pdf"
        multiple
        disabled={processing}
        onChange={handleUpload}
        className="hidden"
      />

      {/* Duplicates warning */}
      {duplicadas > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-center justify-between">
          <p className="text-xs text-amber-700">
            <span className="font-bold">
              {duplicadas} factura{duplicadas > 1 ? 's' : ''} ignorada{duplicadas > 1 ? 's' : ''}
            </span>{' '}
            porque ya existen en el sistema (mismo UUID)
          </p>
          <button onClick={() => setDuplicadas(0)} className="text-[10px] text-amber-500 font-bold hover:underline">
            OK
          </button>
        </div>
      )}

      {/* Instructions */}
      {facturas.length === 0 && (
        <div className="bg-white rounded-2xl border border-neutral-100 p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-neutral-100 text-neutral-400 flex items-center justify-center text-2xl mx-auto mb-4">
            📄
          </div>
          <h3 className="font-bold text-[#0a0a0a] mb-2">Sube tus facturas</h3>
          <p className="text-xs text-neutral-400 max-w-md mx-auto mb-4">XML y PDF de comprobantes CFDI</p>
          <button
            onClick={() => fileRef.current?.click()}
            className="px-5 py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase bg-[#0a0a0a] text-white hover:bg-[#222] transition-colors"
          >
            Seleccionar archivos
          </button>
        </div>
      )}

      {/* Pending facturas */}
      {uploadErrors.map((error) => (
        <p key={error} role="alert" className="mb-3 text-sm text-red-600">
          {error}
        </p>
      ))}
      {pendientes.length > 0 && (
        <div className="space-y-3 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase">
              {pendientes.length} factura{pendientes.length > 1 ? 's' : ''} por procesar
            </h3>
            <button
              onClick={processAll}
              disabled={processing || pendientes.some((f) => f.status === 'pending')}
              className={`${btnPrimary} disabled:opacity-50`}
            >
              {processing ? 'Procesando...' : 'Procesar todas'}
            </button>
          </div>

          {pendientes.map((f) => (
            <div
              key={f.id}
              className={`bg-white rounded-2xl border p-5 ${f.status === 'matched' ? 'border-green-200' : f.status === 'attach' ? 'border-purple-200' : f.status === 'error' ? 'border-red-200' : 'border-neutral-100'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <button
                      onClick={() => toggleTipo(f.id)}
                      disabled={
                        processing || f.status === 'attach' || f.retryStatus === 'attach' || Boolean(config.rfc)
                      }
                      className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase cursor-pointer ${f.tipo === 'ingreso' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}
                    >
                      {f.tipo === 'ingreso' ? 'Factura emitida' : 'Factura recibida'}
                    </button>
                    <span className="text-[10px] text-neutral-400">{f.cfdi.fecha}</span>
                    {f.pdfFile && <span className="text-[10px] text-blue-500 font-bold">+ PDF</span>}
                  </div>
                  <p className="text-sm font-bold text-[#0a0a0a]">
                    {f.cfdi.conceptos.map((c) => c.descripcion).join(', ') || f.cfdi.nombreEmisor}
                  </p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {f.cfdi.nombreEmisor} → {f.cfdi.nombreReceptor}
                  </p>
                  {f.cfdi.uuid && <p className="text-[10px] text-neutral-300 mt-0.5 font-mono">{f.cfdi.uuid}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black text-[#0a0a0a]">{formatCurrency(f.cfdi.total)}</p>
                  {f.cfdi.iva > 0 && <p className="text-[10px] text-neutral-400">IVA: {formatCurrency(f.cfdi.iva)}</p>}
                </div>
              </div>

              {/* Match info */}
              {f.status !== 'attach' && f.retryStatus !== 'attach' && (
                <select
                  aria-label="Vincular factura"
                  disabled={processing}
                  value={f.matchId || (f.status === 'pending' ? '' : 'new')}
                  className="mt-3 w-full rounded-lg border border-neutral-200 p-2 text-sm"
                  onChange={(event) => {
                    const id = event.target.value;
                    const record = (f.tipo === 'ingreso' ? ingresos : egresos).find((r) => r.id === id);
                    setFacturas((prev) =>
                      prev.map((row) =>
                        row.id === f.id
                          ? {
                              ...row,
                              matchId: record?.id,
                              matchDesc: record?.descripcion,
                              status: record ? 'matched' : id === 'new' ? 'new' : 'pending',
                            }
                          : row,
                      ),
                    );
                  }}
                >
                  <option value="">Seleccionar registro</option>
                  <option value="new">Nuevo {f.tipo}</option>
                  {invoiceCandidates(
                    f.cfdi,
                    f.tipo === 'ingreso' ? ingresos : egresos,
                    new Set(facturas.filter((row) => row.id !== f.id && row.matchId).map((row) => row.matchId!)),
                    getProveedores(),
                  ).map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.fecha} · {record.descripcion} · {formatCurrency(record.montoTotal)}
                    </option>
                  ))}
                </select>
              )}
              {f.status === 'error' && (
                <p role="alert" className="mt-3 text-xs text-red-600">
                  {f.error || 'No se pudo completar la factura.'}
                </p>
              )}
              {f.status === 'matched' && f.matchDesc && (
                <div className="mt-3 bg-green-50 rounded-xl p-3">
                  <p className="text-xs text-green-700">
                    <span className="font-bold">Registro seleccionado:</span> {f.matchDesc}
                  </p>
                  <p className="text-[10px] text-green-600 mt-0.5">Se vinculará la factura a este registro existente</p>
                </div>
              )}
              {f.status === 'new' && (
                <div className="mt-3 bg-blue-50 rounded-xl p-3">
                  <p className="text-xs text-blue-700">
                    <span className="font-bold">Nuevo registro:</span> {f.tipo}
                  </p>
                </div>
              )}
              {f.status === 'attach' && f.matchDesc && (
                <div className="mt-3 bg-purple-50 rounded-xl p-3">
                  <p className="text-xs text-purple-700">
                    <span className="font-bold">Ya existe:</span> {f.matchDesc}
                  </p>
                  <p className="text-[10px] text-purple-600 mt-0.5">Sólo se subirá el archivo al registro existente</p>
                </div>
              )}

              {/* Deducibilidad */}
              {f.deducibilidad && (
                <div className="mt-3 flex items-start gap-3 bg-neutral-50 rounded-xl p-3">
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase shrink-0 ${tipoDeduccionColor(f.deducibilidad.tipo)}`}
                  >
                    {tipoDeduccionLabel(f.deducibilidad.tipo)}
                  </span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-[#0a0a0a]">{f.deducibilidad.porcentaje}% deducible</p>
                    <p className="text-[10px] text-neutral-500">{f.deducibilidad.razon}</p>
                    <p className="text-[9px] text-neutral-400 mt-0.5">{f.deducibilidad.regla}</p>
                  </div>
                </div>
              )}

              <div className="flex justify-end mt-3">
                <button
                  onClick={() => removeFactura(f.id)}
                  disabled={processing}
                  className="text-[10px] text-neutral-400 hover:text-red-500 font-bold uppercase tracking-wide"
                >
                  Quitar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Facturas vinculadas (persisten) */}
      {facturasVinculadas.length > 0 && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase">
              {facturasVisible.length} de {facturasVinculadas.length} factura
              {facturasVinculadas.length === 1 ? '' : 's'}
            </h3>
            <div className="flex items-center gap-2">
              <div className="flex rounded-xl border border-neutral-200 overflow-hidden">
                {(['all', 'ingreso', 'egreso'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilterTipo(t)}
                    className={`px-3 py-2 text-[10px] font-bold tracking-[0.05em] uppercase transition-colors ${
                      filterTipo === t
                        ? t === 'ingreso'
                          ? 'bg-green-600 text-white'
                          : t === 'egreso'
                            ? 'bg-[#c72a09] text-white'
                            : 'bg-[#0a0a0a] text-white'
                        : 'bg-white text-neutral-500 hover:text-[#0a0a0a]'
                    }`}
                  >
                    {t === 'all' ? 'Todas' : t === 'ingreso' ? 'Emitidas' : 'Recibidas'}
                  </button>
                ))}
              </div>
              <select
                value={filterYear}
                onChange={(e) => {
                  setFilterYear(Number(e.target.value));
                  setFilterMonth('all');
                }}
                className="border border-neutral-200 rounded-xl px-3 py-2 text-xs font-bold bg-white focus:outline-none focus:border-[#c72a09]"
              >
                {facturaYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <MonthBar
            items={monthBarItems}
            year={filterYear}
            selectedMonth={filterMonth}
            onSelect={setFilterMonth}
            color={monthBarColor}
          />

          <div className="bg-white rounded-2xl border border-neutral-100 overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="px-4 py-3 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                    Fecha
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                    Tipo
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                    Descripción
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                    Total
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                    UUID
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                    Archivos
                  </th>
                </tr>
              </thead>
              <tbody>
                {facturasVisible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-xs text-neutral-400">
                      No hay facturas para este filtro.
                    </td>
                  </tr>
                ) : (
                  facturasVisible.map((f) => (
                    <tr
                      key={`${f.tipo}-${f.id}`}
                      className={`border-b border-neutral-50 transition-colors ${f.soloFiscal ? 'bg-purple-50/30' : 'hover:bg-neutral-50/50'}`}
                    >
                      <td className="px-4 py-3 text-xs text-neutral-400">{formatDate(f.fecha)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase ${f.tipo === 'ingreso' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}
                        >
                          {f.tipo === 'ingreso' ? 'Emitida' : 'Recibida'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold ${f.soloFiscal ? 'text-neutral-400' : 'text-[#0a0a0a]'}`}>
                          {f.desc}
                        </span>
                        {f.soloFiscal && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded text-[8px] font-bold bg-purple-100 text-purple-600 uppercase">
                            Solo fiscal
                          </span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${f.soloFiscal ? 'text-purple-500' : ''}`}>
                        {formatCurrency(f.total)}
                      </td>
                      <td className="px-4 py-3 text-[10px] text-neutral-300 font-mono">{f.uuid.substring(0, 8)}...</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <div className="flex gap-2 justify-end">
                            {f.pdfUrl ? (
                              <button
                                onClick={() => openFacturaFile({ pdfUrl: f.pdfUrl })}
                                className="text-[10px] font-bold uppercase tracking-wide text-[#c72a09] hover:underline"
                              >
                                PDF
                              </button>
                            ) : null}
                            {f.xmlUrl ? (
                              <button
                                onClick={() => openFacturaFile({ xmlUrl: f.xmlUrl })}
                                className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 hover:underline"
                              >
                                XML
                              </button>
                            ) : null}
                            {!f.pdfUrl && !f.xmlUrl && <span className="text-[10px] text-neutral-300">—</span>}
                          </div>
                          {f.tipo === 'egreso' && (
                            <ActionMenu
                              items={[
                                {
                                  label: f.soloFiscal ? 'Quitar solo fiscal' : 'Marcar solo fiscal',
                                  onClick: () => toggleSoloFiscal(f.id),
                                },
                              ]}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
