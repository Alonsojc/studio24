'use client';

import { useState, useEffect, useRef } from 'react';
import { formatCurrency, calcIVA } from '@/lib/helpers';
import { v4 as uuid } from 'uuid';
import { getClientes, getConfig, addCotizacion, updateCotizacion, getCotizaciones, getNextFolio, getProductos } from '@/lib/store';
import { Cliente, ConfigNegocio, Cotizacion, Producto } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import { inputClass, labelClass } from '@/lib/styles';

interface LineItem {
  id: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
}

export default function CotizadorPage() {
  const nextIdRef = useRef(1);
  const [allProductos, setAllProductos] = useState<Producto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [config, setConfigState] = useState<ConfigNegocio | null>(null);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteEmpresa, setClienteEmpresa] = useState('');
  const [items, setItems] = useState<LineItem[]>([
    { id: String(nextIdRef.current++), descripcion: '', cantidad: 1, precioUnitario: 0 },
  ]);
  const [selBordado, setSelBordado] = useState<{ label: string; precio: number } | null>(null);
  const [selPrenda, setSelPrenda] = useState<{ label: string; precio: number } | null>(null);
  const [conIVA, setConIVA] = useState(false);
  const [notas, setNotas] = useState('');
  const [copied, setCopied] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [editingCotId, setEditingCotId] = useState<string | null>(null);
  const [showHistorial, setShowHistorial] = useState(false);
  const [mounted, setMounted] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAllProductos(getProductos().filter((p) => p.activo));
    setClientes(getClientes());
    setConfigState(getConfig());
    setCotizaciones(getCotizaciones().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setMounted(true);
  }, []);

  const cfg = config || { nombreNegocio: 'STUDIO 24', titular: '', banco: '', numeroCuenta: '', clabe: '', telefono: '', email: '', direccion: '', logoUrl: '' };

  const presetsBordado = allProductos.filter((p) => p.categoria === 'bordado').map((p) => ({ label: p.nombre, precio: p.precio }));
  const presetsPrenda = allProductos.filter((p) => p.categoria === 'prenda').map((p) => ({ label: p.nombre, precio: p.precio }));
  const presetsServicios = allProductos.filter((p) => p.categoria === 'servicio' || p.categoria === 'otro').map((p) => ({ label: p.nombre, precio: p.precio }));

  const selectCliente = (id: string) => {
    setClienteId(id);
    const c = clientes.find((c) => c.id === id);
    if (c) {
      setClienteNombre(c.nombre);
      setClienteEmpresa(c.direccion || '');
    } else {
      setClienteNombre('');
      setClienteEmpresa('');
    }
  };

  const addItem = () => {
    setItems([...items, { id: String(nextIdRef.current++), descripcion: '', cantidad: 1, precioUnitario: 0 }]);
  };

  const addCombined = () => {
    if (!selBordado && !selPrenda) return;
    const parts: string[] = [];
    let precio = 0;
    if (selPrenda) { parts.push(selPrenda.label); precio += selPrenda.precio; }
    if (selBordado) { parts.push(selBordado.label); precio += selBordado.precio; }
    const desc = parts.join(' + ');
    setItems([...items, { id: String(nextIdRef.current++), descripcion: desc, cantidad: 1, precioUnitario: precio }]);
    setSelBordado(null);
    setSelPrenda(null);
  };

  const removeItem = (id: string) => {
    if (items.length <= 1) return;
    setItems(items.filter((i) => i.id !== id));
  };

  const updateItem = (id: string, field: keyof LineItem, value: string | number) => {
    setItems(items.map((i) => i.id === id ? { ...i, [field]: value } : i));
  };

  const subtotal = items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0);
  const iva = conIVA ? calcIVA(subtotal) : 0;
  const total = subtotal + iva;

  const today = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

  const guardarCotizacion = () => {
    if (items.filter((i) => i.descripcion && i.precioUnitario > 0).length === 0) return;
    const validItems = items.filter((i) => i.descripcion && i.precioUnitario > 0).map((i) => ({ descripcion: i.descripcion, cantidad: i.cantidad, precioUnitario: i.precioUnitario }));
    if (editingCotId) {
      const existing = cotizaciones.find((c) => c.id === editingCotId);
      if (existing) {
        const updated: Cotizacion = { ...existing, clienteNombre, clienteEmpresa, items: validItems, conIVA, notas, subtotal, iva, total };
        updateCotizacion(updated);
        setCotizaciones(cotizaciones.map((c) => c.id === editingCotId ? updated : c));
      }
    } else {
      const cot: Cotizacion = {
        id: uuid(), folio: getNextFolio('COT'), clienteNombre, clienteEmpresa,
        items: validItems, conIVA, notas, subtotal, iva, total, createdAt: new Date().toISOString(),
      };
      addCotizacion(cot);
      setCotizaciones([cot, ...cotizaciones]);
    }
    setEditingCotId(null);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  };

  const loadCotizacion = (c: Cotizacion) => {
    setEditingCotId(c.id);
    setClienteNombre(c.clienteNombre);
    setClienteEmpresa(c.clienteEmpresa);
    setItems(c.items.map((i) => ({ id: String(nextIdRef.current++), ...i })));
    setConIVA(c.conIVA);
    setNotas(c.notas);
    setShowHistorial(false);
  };

  const generarTexto = () => {
    const lines = [
      `*STUDIO 24 - COTIZACION*`,
      `Fecha: ${today}`,
      '',
      clienteNombre ? `Dirigida a: ${clienteNombre}` : '',
      clienteEmpresa ? clienteEmpresa : '',
      '',
      '*DETALLE:*',
      ...items.filter((i) => i.descripcion && i.precioUnitario > 0).map((i) =>
        `${i.descripcion} - ${i.cantidad} x ${formatCurrency(i.precioUnitario)} = ${formatCurrency(i.cantidad * i.precioUnitario)}`
      ),
      '',
      `*SUBTOTAL:* ${formatCurrency(subtotal)}`,
      conIVA ? `*IVA (16%):* ${formatCurrency(iva)}` : '',
      `*TOTAL: ${formatCurrency(total)}*`,
      '',
      '*INFORMACION DE PAGO:*',
      cfg.titular,
      cfg.banco,
      cfg.numeroCuenta ? `Cuenta: ${cfg.numeroCuenta}` : '',
      cfg.clabe ? `CLABE: ${cfg.clabe}` : '',
      '',
      notas ? `Notas: ${notas}` : '',
    ].filter(Boolean).join('\n');
    return lines;
  };

  const copiarTexto = () => {
    navigator.clipboard.writeText(generarTexto());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const enviarWhatsApp = () => {
    const nl = '\n';
    const nombre = clienteNombre ? clienteNombre.split(' ')[0] : '';
    let msg = '';
    msg += `Hola${nombre ? ` ${nombre}` : ''}! 🧵✨${nl}${nl}`;
    msg += `Gracias por tu interes en *${cfg.nombreNegocio || 'Studio 24'}*! 🎉${nl}${nl}`;
    msg += `Te comparto la cotizacion de tu pedido por un total de *${formatCurrency(total)}*${nl}${nl}`;
    msg += `📎 _Te adjunto el PDF con el detalle completo_${nl}${nl}`;
    if (cfg.titular || cfg.banco || cfg.numeroCuenta) {
      msg += `🏦 *Datos para transferencia:*${nl}`;
      if (cfg.titular) msg += `${cfg.titular}${nl}`;
      if (cfg.banco) msg += `${cfg.banco}${nl}`;
      if (cfg.numeroCuenta) msg += `Cuenta: *${cfg.numeroCuenta}*${nl}`;
      if (cfg.clabe) msg += `CLABE: *${cfg.clabe}*${nl}`;
      msg += nl;
    }
    msg += `Cualquier duda con toda confianza, estamos para servirte! 💪${nl}${nl}`;
    msg += `Saludos,${nl}*${cfg.nombreNegocio || 'Studio 24'}*`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const descargarPDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF('p', 'mm', 'letter');
    const w = doc.internal.pageSize.getWidth();
    let y = 25;

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(36);
    doc.text('COTIZACION', 20, y);
    y += 5;
    doc.setDrawColor(10, 10, 10);
    doc.setLineWidth(0.5);
    doc.line(20, y, w - 20, y);
    y += 10;

    // Meta
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Fecha: ${today}`, 20, y);
    y += 8;
    if (clienteNombre) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(10);
      doc.text('Dirigida a:', 20, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.text(clienteNombre, 20, y);
      y += 5;
      if (clienteEmpresa) { doc.text(clienteEmpresa, 20, y); y += 5; }
    }
    y += 3;
    doc.line(20, y, w - 20, y);
    y += 10;

    // Table header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(10);
    doc.text('DESCRIPCION', 20, y);
    doc.text('CANTIDAD', 110, y, { align: 'right' });
    doc.text('PRECIO', 145, y, { align: 'right' });
    doc.text('TOTAL', w - 20, y, { align: 'right' });
    y += 2;
    doc.setLineWidth(0.3);
    doc.line(20, y, w - 20, y);
    y += 6;

    // Table rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const validItems = items.filter((i) => i.descripcion && i.precioUnitario > 0);
    validItems.forEach((item) => {
      doc.text(item.descripcion, 20, y);
      doc.text(String(item.cantidad), 110, y, { align: 'right' });
      doc.text(`$ ${item.precioUnitario.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, 145, y, { align: 'right' });
      doc.text(`$ ${(item.cantidad * item.precioUnitario).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, w - 20, y, { align: 'right' });
      y += 2;
      doc.setDrawColor(220);
      doc.setLineWidth(0.1);
      doc.line(20, y, w - 20, y);
      y += 6;
    });

    // Totals
    y += 5;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('SUBTOTAL', 145, y, { align: 'right' });
    doc.text(`$ ${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, w - 20, y, { align: 'right' });
    y += 7;
    if (conIVA) {
      doc.text('IVA (16%)', 145, y, { align: 'right' });
      doc.text(`$ ${iva.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, w - 20, y, { align: 'right' });
      y += 7;
    }
    doc.setDrawColor(10);
    doc.setLineWidth(0.5);
    doc.line(130, y - 3, w - 20, y - 3);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('TOTAL', 145, y + 2, { align: 'right' });
    doc.text(`$ ${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, w - 20, y + 2, { align: 'right' });

    // Payment info
    y += 20;
    doc.setDrawColor(10);
    doc.setLineWidth(0.5);
    doc.line(20, y, w - 20, y);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('INFORMACION DE PAGO', 20, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(50);
    if (cfg.titular) { doc.text(cfg.titular, 20, y); y += 5; }
    if (cfg.banco) { doc.text(cfg.banco, 20, y); y += 5; }
    if (cfg.numeroCuenta) { doc.text(`Numero de cuenta: ${cfg.numeroCuenta}`, 20, y); y += 5; }
    if (cfg.clabe) { doc.text(`Cuenta clabe: ${cfg.clabe}`, 20, y); y += 5; }
    if (notas) { y += 3; doc.setTextColor(120); doc.text(`Notas: ${notas}`, 20, y); }

    // Logo text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(199, 42, 9);
    doc.text(cfg.nombreNegocio || 'STCH', w - 20, y, { align: 'right' });

    // Save
    const filename = `cotizacion_${clienteNombre ? clienteNombre.replace(/\s+/g, '_').toLowerCase() : 'studio24'}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
  };

  if (!mounted) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <PageHeader title="Cotizador" description="Genera cotizaciones profesionales" />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Form */}
        <div className="lg:col-span-3 space-y-6">
          {/* Cliente - selector from registered clients */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-6">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-4">Cliente</h3>
            <div className="mb-4">
              <label className={labelClass}>Seleccionar cliente</label>
              <select value={clienteId} onChange={(e) => selectCliente(e.target.value)} className={inputClass}>
                <option value="">-- Escribir manualmente --</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}{c.telefono ? ` (${c.telefono})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelClass}>Nombre</label><input type="text" value={clienteNombre} onChange={(e) => { setClienteNombre(e.target.value); setClienteId(''); }} placeholder="Nombre del contacto" className={inputClass} /></div>
              <div><label className={labelClass}>Empresa / Dirección</label><input type="text" value={clienteEmpresa} onChange={(e) => setClienteEmpresa(e.target.value)} placeholder="Nombre de la empresa" className={inputClass} /></div>
            </div>
          </div>

          {/* Combo builder */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-6">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-4">Armar Concepto</h3>

            <p className="text-[10px] font-bold tracking-[0.08em] text-neutral-300 uppercase mb-2">1. Tipo de bordado {selBordado && <span className="text-[#c72a09]">({selBordado.label})</span>}</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {presetsBordado.map((p) => (
                <button key={p.label} onClick={() => setSelBordado(selBordado?.label === p.label ? null : p)} className={`px-3 py-2 rounded-xl border transition-all text-left ${selBordado?.label === p.label ? 'border-[#c72a09] bg-[#c72a09]/10 ring-1 ring-[#c72a09]/30' : 'border-neutral-200 hover:border-neutral-400'}`}>
                  <span className={`text-xs font-semibold block ${selBordado?.label === p.label ? 'text-[#c72a09]' : 'text-[#0a0a0a]'}`}>{p.label}</span>
                  <span className="text-[10px] text-neutral-400">{formatCurrency(p.precio)}</span>
                </button>
              ))}
              <button onClick={() => setSelBordado(null)} className={`px-3 py-2 rounded-xl border transition-all text-left ${!selBordado ? 'border-[#c72a09] bg-[#c72a09]/10' : 'border-neutral-200 hover:border-neutral-400'}`}>
                <span className="text-xs font-semibold text-neutral-400">Sin bordado</span>
              </button>
            </div>

            <p className="text-[10px] font-bold tracking-[0.08em] text-neutral-300 uppercase mb-2">2. Prenda {selPrenda && <span className="text-[#c72a09]">({selPrenda.label})</span>}</p>
            <div className="flex flex-wrap gap-2 mb-5">
              {presetsPrenda.map((p) => (
                <button key={p.label} onClick={() => setSelPrenda(selPrenda?.label === p.label ? null : p)} className={`px-3 py-2 rounded-xl border transition-all text-left ${selPrenda?.label === p.label ? 'border-[#c72a09] bg-[#c72a09]/10 ring-1 ring-[#c72a09]/30' : 'border-neutral-200 hover:border-neutral-400'}`}>
                  <span className={`text-xs font-semibold block ${selPrenda?.label === p.label ? 'text-[#c72a09]' : 'text-[#0a0a0a]'}`}>{p.label}</span>
                  <span className="text-[10px] text-neutral-400">{formatCurrency(p.precio)}</span>
                </button>
              ))}
              <button onClick={() => setSelPrenda(null)} className={`px-3 py-2 rounded-xl border transition-all text-left ${!selPrenda ? 'border-[#c72a09] bg-[#c72a09]/10' : 'border-neutral-200 hover:border-neutral-400'}`}>
                <span className="text-xs font-semibold text-neutral-400">Cliente trae prenda</span>
              </button>
            </div>

            {/* Servicios - add directly */}
            {presetsServicios.length > 0 && (
              <>
                <p className="text-[10px] font-bold tracking-[0.08em] text-neutral-300 uppercase mb-2 mt-4">Servicios (agregar directo)</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {presetsServicios.map((p) => (
                    <button key={p.label} onClick={() => { setItems([...items, { id: String(nextIdRef.current++), descripcion: p.label, cantidad: 1, precioUnitario: p.precio }]); }} className="px-3 py-2 rounded-xl border border-neutral-200 hover:border-[#c72a09] hover:bg-[#c72a09]/5 transition-all text-left">
                      <span className="text-xs font-semibold text-[#0a0a0a] block">{p.label}</span>
                      <span className="text-[10px] text-neutral-400">{formatCurrency(p.precio)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Preview & Add */}
            {(selBordado || selPrenda) && (
              <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#0a0a0a]">
                    {[selPrenda?.label, selBordado?.label].filter(Boolean).join(' + ')}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {[selPrenda && formatCurrency(selPrenda.precio), selBordado && formatCurrency(selBordado.precio)].filter(Boolean).join(' + ')}
                  </p>
                </div>
                <span className="text-lg font-black text-[#c72a09]">{formatCurrency((selBordado?.precio || 0) + (selPrenda?.precio || 0))}</span>
                <button onClick={addCombined} className="bg-[#c72a09] text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide hover:bg-[#a82207] transition-colors shrink-0">
                  Agregar
                </button>
              </div>
            )}
          </div>

          {/* Items table */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase">Conceptos ({items.filter((i) => i.descripcion).length})</h3>
              <button onClick={addItem} className="bg-[#0a0a0a] text-white px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-[0.05em] uppercase hover:bg-[#222] transition-colors">+ Linea manual</button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={item.id} className="flex gap-3 items-start p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                  <span className="text-[10px] font-bold text-neutral-300 mt-3 w-5 shrink-0">{idx + 1}</span>
                  <div className="flex-1 grid grid-cols-6 gap-3">
                    <div className="col-span-3">
                      <label className="text-[9px] text-neutral-400 font-medium">Descripción</label>
                      <input type="text" value={item.descripcion} onChange={(e) => updateItem(item.id, 'descripcion', e.target.value)} placeholder="Ej: Gorras Premium" className={inputClass} />
                    </div>
                    <div className="col-span-1">
                      <label className="text-[9px] text-neutral-400 font-medium">Cant.</label>
                      <input type="number" min="1" value={item.cantidad} onChange={(e) => updateItem(item.id, 'cantidad', Math.max(1, parseInt(e.target.value) || 1))} className={inputClass} />
                    </div>
                    <div className="col-span-1">
                      <label className="text-[9px] text-neutral-400 font-medium">Precio</label>
                      <input type="number" step="0.01" min="0" value={item.precioUnitario || ''} onChange={(e) => updateItem(item.id, 'precioUnitario', parseFloat(e.target.value) || 0)} className={inputClass} />
                    </div>
                    <div className="col-span-1 flex flex-col">
                      <label className="text-[9px] text-neutral-400 font-medium">Total</label>
                      <span className="text-sm font-bold text-[#0a0a0a] mt-2.5">{formatCurrency(item.cantidad * item.precioUnitario)}</span>
                    </div>
                  </div>
                  <button onClick={() => removeItem(item.id)} className={`mt-6 shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${items.length > 1 ? 'text-neutral-300 hover:text-red-500 hover:bg-red-50' : 'text-neutral-100 cursor-not-allowed'}`} disabled={items.length <= 1}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Opciones */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-6">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-4">Opciones</h3>
            <label className="flex items-center gap-2.5 cursor-pointer mb-4">
              <input type="checkbox" checked={conIVA} onChange={(e) => setConIVA(e.target.checked)} className="w-4 h-4 accent-[#c72a09] rounded" />
              <span className="text-sm font-semibold text-[#0a0a0a]">Incluir IVA (16%)</span>
              {conIVA && subtotal > 0 && <span className="text-xs text-neutral-400 ml-1">{formatCurrency(iva)}</span>}
            </label>
            <div><label className={labelClass}>Notas</label><textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder="Condiciones, tiempo de entrega..." className={inputClass} /></div>
          </div>
        </div>

        {/* Preview & Actions */}
        <div className="lg:col-span-2">
          <div className="sticky top-8 space-y-4">
            {/* Preview */}
            <div ref={printRef} className="bg-white rounded-2xl border border-neutral-100 p-6">
              <h2 className="text-2xl font-black tracking-[-0.03em] uppercase mb-1">COTIZACION</h2>
              <div className="w-full h-[2px] bg-[#0a0a0a] mb-3" />
              <p className="text-[10px] text-neutral-400">{today}</p>
              {clienteNombre && (
                <div className="mt-3">
                  <p className="text-[10px] font-bold text-neutral-400">Dirigida a:</p>
                  <p className="text-xs font-semibold text-[#0a0a0a]">{clienteNombre}</p>
                  {clienteEmpresa && <p className="text-xs text-neutral-500">{clienteEmpresa}</p>}
                </div>
              )}
              <div className="w-full h-px bg-neutral-100 my-3" />
              <div className="space-y-1.5">
                {items.filter((i) => i.descripcion && i.precioUnitario > 0).map((i) => (
                  <div key={i.id} className="flex justify-between text-xs">
                    <span className="text-neutral-600">{i.descripcion} <span className="text-neutral-300">x{i.cantidad}</span></span>
                    <span className="font-bold">{formatCurrency(i.cantidad * i.precioUnitario)}</span>
                  </div>
                ))}
              </div>
              {items.filter((i) => i.descripcion && i.precioUnitario > 0).length === 0 && (
                <p className="text-xs text-neutral-300 text-center py-4">Agrega conceptos</p>
              )}
              <div className="w-full h-px bg-neutral-100 my-3" />
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs"><span className="text-neutral-400">Subtotal</span><span className="font-bold">{formatCurrency(subtotal)}</span></div>
                {conIVA && <div className="flex justify-between text-xs"><span className="text-neutral-400">IVA (16%)</span><span className="font-bold">{formatCurrency(iva)}</span></div>}
                <div className="flex justify-between items-end pt-2 border-t border-neutral-100">
                  <span className="text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">Total</span>
                  <span className="text-xl font-black text-[#c72a09]">{formatCurrency(total)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <button onClick={guardarCotizacion} className={`w-full py-3.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase transition-colors ${savedMsg ? 'bg-green-500 text-white' : 'bg-[#c72a09] text-white hover:bg-[#a82207]'}`}>
              {savedMsg ? '¡Guardada!' : editingCotId ? 'Actualizar Cotización' : 'Guardar Cotización'}
            </button>

            <button onClick={() => setShowHistorial(!showHistorial)} className={`w-full py-3 rounded-xl text-xs font-bold tracking-[0.05em] uppercase transition-colors border ${showHistorial ? 'bg-[#0a0a0a] text-white border-[#0a0a0a]' : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-400'}`}>
              Historial ({cotizaciones.length})
            </button>

            {showHistorial && cotizaciones.length > 0 && (
              <div className="bg-white rounded-xl border border-neutral-100 max-h-60 overflow-y-auto">
                {cotizaciones.map((c) => (
                  <button key={c.id} onClick={() => loadCotizacion(c)} className="w-full text-left px-4 py-3 border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-[#c72a09]">{c.folio}</span>
                      <span className="text-xs font-bold">{formatCurrency(c.total)}</span>
                    </div>
                    <p className="text-xs text-neutral-600 mt-0.5">{c.clienteNombre || 'Sin cliente'}</p>
                    <p className="text-[10px] text-neutral-300">{new Date(c.createdAt).toLocaleDateString('es-MX')}</p>
                  </button>
                ))}
              </div>
            )}

            <button onClick={descargarPDF} className="w-full bg-[#0a0a0a] text-white py-3.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase hover:bg-[#222] transition-colors flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Descargar PDF
            </button>

            <button onClick={enviarWhatsApp} className="w-full bg-[#25D366] text-white py-3.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase hover:bg-[#20bd5a] transition-colors flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp
            </button>

            <button onClick={copiarTexto} className={`w-full py-3.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase transition-colors border ${copied ? 'bg-green-50 text-green-600 border-green-200' : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-400'}`}>
              {copied ? 'Copiado!' : 'Copiar texto'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
