'use client';

import { useState, useRef, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { getIngresos, getEgresos, getConfig } from '@/lib/store';
import { addIngreso, updateIngreso, addEgreso, updateEgreso } from '@/lib/store-sync';
import { Ingreso, Egreso } from '@/lib/types';
import { formatCurrency, formatDate, todayString, calcIVA } from '@/lib/helpers';
import { parseXMLFile, mapFormaPago, type DatosCFDI } from '@/lib/cfdi';
import PageHeader from '@/components/PageHeader';
import { btnPrimary } from '@/lib/styles';

interface FacturaPendiente {
  id: string;
  cfdi: DatosCFDI;
  xmlFile: File;
  pdfFile?: File;
  tipo: 'ingreso' | 'egreso';
  matchId?: string;
  matchDesc?: string;
  status: 'pending' | 'matched' | 'new' | 'done' | 'error';
}

export default function FacturasPage() {
  const isClient = typeof window !== 'undefined';
  const [ingresos] = useState(() => (isClient ? getIngresos() : []));
  const [egresos] = useState(() => (isClient ? getEgresos() : []));
  const [config] = useState(() => (isClient ? getConfig() : null));
  const [mounted] = useState(() => isClient);
  const [facturas, setFacturas] = useState<FacturaPendiente[]>([]);
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => {
    // Re-read from store for matching
  }, []);

  if (!mounted) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" /></div>;

  const miRFC = config?.nombreNegocio || ''; // TODO: add RFC to config

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const xmlFiles = files.filter((f) => f.name.endsWith('.xml'));
    const pdfFiles = files.filter((f) => f.name.endsWith('.pdf'));

    const nuevas: FacturaPendiente[] = [];

    for (const xmlFile of xmlFiles) {
      const cfdi = await parseXMLFile(xmlFile);
      if (!cfdi) continue;

      // Find matching PDF by similar name
      const baseName = xmlFile.name.replace('.xml', '');
      const pdfFile = pdfFiles.find((p) => p.name.replace('.pdf', '') === baseName);

      // Determine if it's an ingreso (we emitted) or egreso (we received)
      // TipoComprobante: I = Ingreso, E = Egreso, P = Pago
      const tipo: 'ingreso' | 'egreso' = cfdi.tipoComprobante === 'I' ? 'ingreso' : 'egreso';

      // Try to find a match in existing records
      const match = findMatch(cfdi, tipo);

      nuevas.push({
        id: uuid(),
        cfdi,
        xmlFile,
        pdfFile,
        tipo,
        matchId: match?.id,
        matchDesc: match?.desc,
        status: match ? 'matched' : 'new',
      });
    }

    setFacturas((prev) => [...prev, ...nuevas]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const findMatch = (cfdi: DatosCFDI, tipo: 'ingreso' | 'egreso'): { id: string; desc: string } | null => {
    // Search in existing records for a match by amount + date proximity
    const records = tipo === 'ingreso' ? ingresos : egresos;
    const tolerance = 0.01; // $0.01 tolerance for rounding

    for (const rec of records) {
      // Skip if already has a CFDI
      if ((rec as Ingreso).uuidCFDI) continue;

      const montoMatch = Math.abs(rec.montoTotal - cfdi.total) <= tolerance || Math.abs(rec.monto - cfdi.subtotal) <= tolerance;
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

    for (let i = 0; i < updated.length; i++) {
      const f = updated[i];
      if (f.status === 'done') continue;

      try {
        if (f.status === 'matched' && f.matchId) {
          // Link to existing record
          if (f.tipo === 'ingreso') {
            const existing = ingresos.find((r) => r.id === f.matchId);
            if (existing) {
              updateIngreso({
                ...existing,
                factura: true,
                numeroFactura: f.cfdi.uuid,
                uuidCFDI: f.cfdi.uuid,
                iva: f.cfdi.iva,
                montoTotal: f.cfdi.total,
              });
            }
          } else {
            const existing = egresos.find((r) => r.id === f.matchId);
            if (existing) {
              updateEgreso({
                ...existing,
                factura: true,
                numeroFactura: f.cfdi.uuid,
                uuidCFDI: f.cfdi.uuid,
                iva: f.cfdi.iva,
                montoTotal: f.cfdi.total,
              });
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
              notas: `Importado desde XML. Emisor: ${f.cfdi.nombreEmisor}`,
              createdAt: new Date().toISOString(),
            };
            addEgreso(egreso);
          }
        }
        updated[i] = { ...f, status: 'done' };
      } catch {
        updated[i] = { ...f, status: 'error' };
      }
    }

    setFacturas(updated);
    setProcessing(false);
  };

  const removeFactura = (id: string) => {
    setFacturas((prev) => prev.filter((f) => f.id !== id));
  };

  const toggleTipo = (id: string) => {
    setFacturas((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const nuevoTipo = f.tipo === 'ingreso' ? 'egreso' as const : 'ingreso' as const;
        const match = findMatch(f.cfdi, nuevoTipo);
        return { ...f, tipo: nuevoTipo, matchId: match?.id, matchDesc: match?.desc, status: match ? 'matched' : 'new' };
      }),
    );
  };

  const pendientes = facturas.filter((f) => f.status !== 'done');
  const procesadas = facturas.filter((f) => f.status === 'done');

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

      {/* Instructions */}
      {facturas.length === 0 && (
        <div className="bg-white rounded-2xl border border-neutral-100 p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-neutral-100 text-neutral-400 flex items-center justify-center text-2xl mx-auto mb-4">
            📄
          </div>
          <h3 className="font-bold text-[#0a0a0a] mb-2">Sube tus facturas</h3>
          <p className="text-xs text-neutral-400 max-w-md mx-auto mb-4">
            Arrastra o selecciona archivos XML y PDF. El sistema lee el CFDI,
            busca si ya existe un ingreso o egreso con el mismo monto, y lo vincula automáticamente.
            Si no encuentra match, crea uno nuevo.
          </p>
          <button onClick={() => fileRef.current?.click()} className="px-5 py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase bg-[#0a0a0a] text-white hover:bg-[#222] transition-colors">
            Seleccionar archivos
          </button>
        </div>
      )}

      {/* Pending facturas */}
      {pendientes.length > 0 && (
        <div className="space-y-3 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase">{pendientes.length} factura{pendientes.length > 1 ? 's' : ''} por procesar</h3>
            <button onClick={processAll} disabled={processing} className={`${btnPrimary} disabled:opacity-50`}>
              {processing ? 'Procesando...' : 'Procesar todas'}
            </button>
          </div>

          {pendientes.map((f) => (
            <div key={f.id} className={`bg-white rounded-2xl border p-5 ${f.status === 'matched' ? 'border-green-200' : f.status === 'error' ? 'border-red-200' : 'border-neutral-100'}`}>
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

              <div className="flex justify-end mt-3">
                <button onClick={() => removeFactura(f.id)} className="text-[10px] text-neutral-400 hover:text-red-500 font-bold uppercase tracking-wide">
                  Quitar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Processed */}
      {procesadas.length > 0 && (
        <div>
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-3">{procesadas.length} procesada{procesadas.length > 1 ? 's' : ''}</h3>
          <div className="space-y-2">
            {procesadas.map((f) => (
              <div key={f.id} className="bg-green-50 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-green-700">{f.cfdi.conceptos[0]?.descripcion || f.cfdi.nombreEmisor}</p>
                  <p className="text-[10px] text-green-600">{f.status === 'done' ? (f.matchId ? 'Vinculada' : 'Creada') : 'Error'}</p>
                </div>
                <p className="text-sm font-bold text-green-700">{formatCurrency(f.cfdi.total)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
