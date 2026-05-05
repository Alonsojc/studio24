'use client';

import { useState, useRef } from 'react';
import { v4 as uuid } from 'uuid';
import { getIngresos, getEgresos, getConfig, getProveedores } from '@/lib/store';
import { cloudGetIngresosByYear, cloudGetEgresosByYear } from '@/lib/store-cloud';
import { useCloudStore } from '@/lib/useCloudStore';
import { addIngreso, updateIngreso, addEgreso, updateEgreso, updateProveedor } from '@/lib/store-sync';
import { Ingreso, Egreso } from '@/lib/types';
import { formatCurrency, formatDate, todayString } from '@/lib/helpers';
import { parseXMLFile, mapFormaPago, type DatosCFDI } from '@/lib/cfdi';
import { uploadFacturaFiles, openFacturaFile } from '@/lib/cfdi-storage';
import {
  clasificarDeducibilidad,
  tipoDeduccionLabel,
  tipoDeduccionColor,
  type ResultadoDeducibilidad,
} from '@/lib/deducibilidad';
import PageHeader from '@/components/PageHeader';
import MonthBar from '@/components/MonthBar';
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
  const { data: egresos } = useCloudStore(getEgresos, () => cloudGetEgresosByYear(filterYear), 'bordados_egresos', [
    filterYear,
  ]);
  const [config] = useState(getConfig);
  const [facturas, setFacturas] = useState<FacturaPendiente[]>([]);
  const [processing, setProcessing] = useState(false);
  const [duplicadas, setDuplicadas] = useState(0);
  const [filterTipo, setFilterTipo] = useState<'all' | 'ingreso' | 'egreso'>('all');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const xmlFiles = files.filter((f) => f.name.endsWith('.xml'));
    const pdfFiles = files.filter((f) => f.name.endsWith('.pdf'));

    const nuevas: FacturaPendiente[] = [];
    let skipped = 0;
    // Track IDs already matched in this batch to prevent two XMLs from claiming the same record
    const batchMatchedIds = new Set<string>(facturas.filter((f) => f.matchId).map((f) => f.matchId!));

    for (const xmlFile of xmlFiles) {
      const cfdi = await parseXMLFile(xmlFile);
      if (!cfdi) continue;

      // Find matching PDF by similar name (used in all flows)
      const baseName = xmlFile.name.replace('.xml', '');
      const pdfFile = pdfFiles.find((p) => p.name.replace('.pdf', '') === baseName);

      // Skip if this same CFDI is already queued in the current session
      const alreadyInBatch =
        cfdi.uuid && (nuevas.some((n) => n.cfdi.uuid === cfdi.uuid) || facturas.some((f) => f.cfdi.uuid === cfdi.uuid));
      if (alreadyInBatch) {
        skipped++;
        continue;
      }

      // Look up an existing record in ingresos/egresos, first by UUID, then by amount+date.
      let existing: { id: string; descripcion: string; xmlUrl?: string; pdfUrl?: string } | null = null;
      let existingTipo: 'ingreso' | 'egreso' | null = null;
      if (cfdi.uuid) {
        const ing = ingresos.find((i) => i.uuidCFDI === cfdi.uuid);
        if (ing) {
          existing = ing;
          existingTipo = 'ingreso';
        } else {
          const eg = egresos.find((e) => e.uuidCFDI === cfdi.uuid);
          if (eg) {
            existing = eg;
            existingTipo = 'egreso';
          }
        }
      }
      if (!existing && cfdi.total > 0) {
        const ing = ingresos.find(
          (i) => i.factura && Math.abs(i.montoTotal - cfdi.total) < 0.01 && i.fecha === cfdi.fecha,
        );
        if (ing) {
          existing = ing;
          existingTipo = 'ingreso';
        } else {
          const eg = egresos.find(
            (e) => e.factura && Math.abs(e.montoTotal - cfdi.total) < 0.01 && e.fecha === cfdi.fecha,
          );
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
      const match = findMatch(cfdi, tipo, batchMatchedIds);
      if (match) batchMatchedIds.add(match.id);

      // Auto-classify deducibility for egresos
      const descConceptos = cfdi.conceptos.map((c) => c.descripcion).join(' ');
      const deducibilidad = tipo === 'egreso' ? clasificarDeducibilidad(cfdi.usoCFDI, descConceptos) : undefined;

      nuevas.push({
        id: uuid(),
        cfdi,
        xmlFile,
        pdfFile,
        tipo,
        matchId: match?.id,
        matchDesc: match?.desc,
        deducibilidad,
        status: match ? 'matched' : 'new',
      });
    }

    setFacturas((prev) => [...prev, ...nuevas]);
    if (skipped > 0) setDuplicadas(skipped);
    if (fileRef.current) fileRef.current.value = '';
  };

  const findMatch = (
    cfdi: DatosCFDI,
    tipo: 'ingreso' | 'egreso',
    excludeIds?: Set<string>,
  ): { id: string; desc: string } | null => {
    // Search in existing records for a match by amount + date proximity
    const records = tipo === 'ingreso' ? ingresos : egresos;
    const tolerance = 0.01; // $0.01 tolerance for rounding

    for (const rec of records) {
      // Skip if already has a CFDI
      if ((rec as Ingreso).uuidCFDI) continue;
      // Skip if already claimed by another factura in this batch
      if (excludeIds && excludeIds.has(rec.id)) continue;

      const montoMatch =
        Math.abs(rec.montoTotal - cfdi.total) <= tolerance || Math.abs(rec.monto - cfdi.subtotal) <= tolerance;
      if (!montoMatch) continue;

      // Check date proximity (within 7 days)
      const recDate = new Date(rec.fecha);
      const cfdiDate = new Date(cfdi.fecha);
      const daysDiff = Math.abs((recDate.getTime() - cfdiDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > 7) continue;

      return { id: rec.id, desc: rec.descripcion };
    }
    return null;
  };

  const processAll = async () => {
    setProcessing(true);
    const updated = [...facturas];
    // Re-read fresh data to avoid overwriting UUIDs set in a previous session
    const freshIngresos = getIngresos();
    const freshEgresos = getEgresos();
    const freshProveedores = getProveedores();
    // Track IDs already processed in this batch to prevent double-linking
    const processedMatchIds = new Set<string>();

    // Helper: when an egreso gets linked to a CFDI, backfill the proveedor's
    // RFC from the emisor if the proveedor still has no RFC. This is what
    // makes DIOT work later without manual data entry.
    const syncProveedorRfc = (egreso: Egreso | undefined, rfcEmisor: string) => {
      if (!egreso || !egreso.proveedorId || !rfcEmisor) return;
      const prov = freshProveedores.find((p) => p.id === egreso.proveedorId);
      if (prov && !prov.rfc) {
        updateProveedor({ ...prov, rfc: rfcEmisor.toUpperCase() });
      }
    };

    for (let i = 0; i < updated.length; i++) {
      const f = updated[i];
      if (f.status === 'done') continue;

      // If another factura in this batch already claimed this match, demote to "new"
      if (f.status === 'matched' && f.matchId && processedMatchIds.has(f.matchId)) {
        updated[i] = { ...f, status: 'new', matchId: undefined, matchDesc: undefined };
      }

      try {
        const current = updated[i];
        if (current.status === 'matched' && current.matchId) {
          // Double-check the record hasn't been linked to a CFDI since we last read
          const freshRec =
            current.tipo === 'ingreso'
              ? freshIngresos.find((r) => r.id === current.matchId)
              : freshEgresos.find((r) => r.id === current.matchId);
          if (freshRec && (freshRec as Ingreso).uuidCFDI) {
            // Already linked — demote to "new" to create a fresh record instead
            updated[i] = { ...current, status: 'new', matchId: undefined, matchDesc: undefined };
          } else {
            processedMatchIds.add(current.matchId);
          }
        }

        // Attach-only: factura already exists in the system, we just want
        // to upload its files and persist the paths on the existing record.
        const current2 = updated[i];
        if (current2.status === 'attach' && current2.matchId) {
          let attachXml = '';
          let attachPdf = '';
          try {
            const uploaded = await uploadFacturaFiles(
              current2.cfdi.uuid || current2.id,
              current2.xmlFile,
              current2.pdfFile,
            );
            attachXml = uploaded.xmlPath;
            attachPdf = uploaded.pdfPath;
          } catch (err) {
            console.warn('No se pudo subir el archivo de factura', err);
            updated[i] = { ...current2, status: 'error' };
            continue;
          }
          if (current2.tipo === 'ingreso') {
            const existing = freshIngresos.find((r) => r.id === current2.matchId);
            if (existing) {
              updateIngreso({
                ...existing,
                factura: true,
                numeroFactura: existing.numeroFactura || current2.cfdi.uuid,
                uuidCFDI: existing.uuidCFDI || current2.cfdi.uuid,
                xmlUrl: existing.xmlUrl || attachXml,
                pdfUrl: existing.pdfUrl || attachPdf,
              });
            }
          } else {
            const existing = freshEgresos.find((r) => r.id === current2.matchId);
            if (existing) {
              updateEgreso({
                ...existing,
                factura: true,
                numeroFactura: existing.numeroFactura || current2.cfdi.uuid,
                uuidCFDI: existing.uuidCFDI || current2.cfdi.uuid,
                xmlUrl: existing.xmlUrl || attachXml,
                pdfUrl: existing.pdfUrl || attachPdf,
              });
              syncProveedorRfc(existing, current2.cfdi.rfcEmisor);
            }
          }
          updated[i] = { ...current2, status: 'done' };
          continue;
        }

        // Upload XML (and PDF if present) to Supabase Storage so we can
        // view them later from the ingreso/egreso row or this page.
        let xmlUrl = '';
        let pdfUrl = '';
        try {
          const uploaded = await uploadFacturaFiles(f.cfdi.uuid || f.id, f.xmlFile, f.pdfFile);
          xmlUrl = uploaded.xmlPath;
          pdfUrl = uploaded.pdfPath;
        } catch (err) {
          // Non-fatal: the factura still gets linked; files just aren't stored.
          console.warn('No se pudo subir el archivo de factura', err);
        }

        const afterCheck = updated[i];
        if (afterCheck.status === 'matched' && afterCheck.matchId) {
          // Link to existing record
          if (afterCheck.tipo === 'ingreso') {
            const existing = freshIngresos.find((r) => r.id === afterCheck.matchId);
            if (existing) {
              updateIngreso({
                ...existing,
                factura: true,
                numeroFactura: afterCheck.cfdi.uuid,
                uuidCFDI: afterCheck.cfdi.uuid,
                iva: afterCheck.cfdi.iva,
                montoTotal: afterCheck.cfdi.total,
                xmlUrl: xmlUrl || existing.xmlUrl,
                pdfUrl: pdfUrl || existing.pdfUrl,
              });
            }
          } else {
            const existing = freshEgresos.find((r) => r.id === afterCheck.matchId);
            if (existing) {
              updateEgreso({
                ...existing,
                factura: true,
                numeroFactura: afterCheck.cfdi.uuid,
                uuidCFDI: afterCheck.cfdi.uuid,
                iva: afterCheck.cfdi.iva,
                montoTotal: afterCheck.cfdi.total,
                xmlUrl: xmlUrl || existing.xmlUrl,
                pdfUrl: pdfUrl || existing.pdfUrl,
              });
              syncProveedorRfc(existing, afterCheck.cfdi.rfcEmisor);
            }
          }
        } else {
          // Create new record
          const desc = f.cfdi.conceptos.map((c) => c.descripcion).join(', ') || f.cfdi.nombreEmisor;

          if (f.tipo === 'ingreso') {
            const ingreso: Ingreso = {
              id: uuid(),
              fecha: f.cfdi.fecha || todayString(),
              clienteId: '',
              descripcion: desc.substring(0, 100),
              concepto: 'otro',
              monto: f.cfdi.subtotal,
              iva: f.cfdi.iva,
              montoTotal: f.cfdi.total,
              formaPago: mapFormaPago(f.cfdi.formaPago),
              factura: true,
              numeroFactura: f.cfdi.uuid,
              uuidCFDI: f.cfdi.uuid,
              xmlUrl,
              pdfUrl,
              notas: `Importado desde XML. Emisor: ${f.cfdi.nombreEmisor}`,
              createdAt: new Date().toISOString(),
            };
            addIngreso(ingreso);
          } else {
            const egreso: Egreso = {
              id: uuid(),
              fecha: f.cfdi.fecha || todayString(),
              descripcion: desc.substring(0, 100),
              categoria: 'otro',
              subcategoria: '',
              proveedorId: '',
              monto: f.cfdi.subtotal,
              iva: f.cfdi.iva,
              montoTotal: f.cfdi.total,
              formaPago: mapFormaPago(f.cfdi.formaPago),
              factura: true,
              numeroFactura: f.cfdi.uuid,
              uuidCFDI: f.cfdi.uuid,
              xmlUrl,
              pdfUrl,
              notas: `Importado desde XML. Emisor: ${f.cfdi.nombreEmisor}`,
              createdAt: new Date().toISOString(),
            };
            addEgreso(egreso);
          }
        }
        updated[i] = { ...updated[i], status: 'done' };
      } catch {
        updated[i] = { ...updated[i], status: 'error' };
      }
    }

    setFacturas(updated);
    setProcessing(false);
  };

  const removeFactura = (id: string) => {
    setFacturas((prev) => prev.filter((f) => f.id !== id));
  };

  const toggleTipo = (id: string) => {
    setFacturas((prev) => {
      // Collect IDs already matched by other facturas
      const otherMatchedIds = new Set(prev.filter((f) => f.id !== id && f.matchId).map((f) => f.matchId!));
      return prev.map((f) => {
        if (f.id !== id) return f;
        const nuevoTipo = f.tipo === 'ingreso' ? ('egreso' as const) : ('ingreso' as const);
        const match = findMatch(f.cfdi, nuevoTipo, otherMatchedIds);
        return { ...f, tipo: nuevoTipo, matchId: match?.id, matchDesc: match?.desc, status: match ? 'matched' : 'new' };
      });
    });
  };

  const pendientes = facturas.filter((f) => f.status !== 'done');
  // Facturas ya vinculadas (persisten entre navegaciones)
  const facturasVinculadas = [
    ...ingresos
      .filter((i) => i.uuidCFDI)
      .map((i) => ({
        tipo: 'ingreso' as const,
        desc: i.descripcion,
        total: i.montoTotal,
        uuid: i.uuidCFDI!,
        fecha: i.fecha,
        montoTotal: i.montoTotal,
        xmlUrl: i.xmlUrl || '',
        pdfUrl: i.pdfUrl || '',
      })),
    ...egresos
      .filter((e) => e.uuidCFDI)
      .map((e) => ({
        tipo: 'egreso' as const,
        desc: e.descripcion,
        total: e.montoTotal,
        uuid: e.uuidCFDI!,
        fecha: e.fecha,
        montoTotal: e.montoTotal,
        xmlUrl: e.xmlUrl || '',
        pdfUrl: e.pdfUrl || '',
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
        description="Sube XMLs de CFDI para vincular o crear registros automáticamente"
        action={
          <button onClick={() => fileRef.current?.click()} className={btnPrimary}>
            + Subir XMLs / PDFs
          </button>
        }
      />
      <input ref={fileRef} type="file" accept=".xml,.pdf" multiple onChange={handleUpload} className="hidden" />

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
          <p className="text-xs text-neutral-400 max-w-md mx-auto mb-4">
            Arrastra o selecciona archivos XML y PDF. El sistema lee el CFDI, busca si ya existe un ingreso o egreso con
            el mismo monto, y lo vincula automáticamente. Si no encuentra match, crea uno nuevo.
          </p>
          <button
            onClick={() => fileRef.current?.click()}
            className="px-5 py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase bg-[#0a0a0a] text-white hover:bg-[#222] transition-colors"
          >
            Seleccionar archivos
          </button>
        </div>
      )}

      {/* Pending facturas */}
      {pendientes.length > 0 && (
        <div className="space-y-3 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase">
              {pendientes.length} factura{pendientes.length > 1 ? 's' : ''} por procesar
            </h3>
            <button onClick={processAll} disabled={processing} className={`${btnPrimary} disabled:opacity-50`}>
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
              {f.status === 'matched' && f.matchDesc && (
                <div className="mt-3 bg-green-50 rounded-xl p-3">
                  <p className="text-xs text-green-700">
                    <span className="font-bold">Match encontrado:</span> {f.matchDesc}
                  </p>
                  <p className="text-[10px] text-green-600 mt-0.5">Se vinculará la factura a este registro existente</p>
                </div>
              )}
              {f.status === 'new' && (
                <div className="mt-3 bg-blue-50 rounded-xl p-3">
                  <p className="text-xs text-blue-700">
                    <span className="font-bold">Sin match:</span> Se creará un nuevo {f.tipo} automáticamente
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
                    <tr key={f.uuid} className="border-b border-neutral-50 hover:bg-neutral-50/50">
                      <td className="px-4 py-3 text-xs text-neutral-400">{formatDate(f.fecha)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase ${f.tipo === 'ingreso' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}
                        >
                          {f.tipo === 'ingreso' ? 'Emitida' : 'Recibida'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#0a0a0a]">{f.desc}</td>
                      <td className="px-4 py-3 text-right font-bold">{formatCurrency(f.total)}</td>
                      <td className="px-4 py-3 text-[10px] text-neutral-300 font-mono">{f.uuid.substring(0, 8)}...</td>
                      <td className="px-4 py-3 text-right">
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
