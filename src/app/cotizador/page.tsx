'use client';

import { useState, useEffect, useRef } from 'react';
import { formatCurrency, calcIVA } from '@/lib/helpers';
import { v4 as uuid } from 'uuid';
import { getClientes, getConfig, addCotizacion, getCotizaciones, getNextFolio, getProductos } from '@/lib/store';
import { Cliente, ConfigNegocio, Cotizacion, Producto } from '@/lib/types';
import PageHeader from '@/components/PageHeader';

const inputClass = "w-full border border-neutral-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#c72a09] focus:ring-1 focus:ring-[#c72a09]/20 transition-colors";
const labelClass = "block text-[10px] font-bold tracking-[0.08em] text-neutral-400 uppercase mb-1.5";

interface LineItem {
  id: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
}

let nextId = 1;

export default function CotizadorPage() {
  const [allProductos, setAllProductos] = useState<Producto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [config, setConfigState] = useState<ConfigNegocio | null>(null);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteEmpresa, setClienteEmpresa] = useState('');
  const [items, setItems] = useState<LineItem[]>([
    { id: String(nextId++), descripcion: '', cantidad: 1, precioUnitario: 0 },
  ]);
  const [selBordado, setSelBordado] = useState<{ label: string; precio: number } | null>(null);
  const [selPrenda, setSelPrenda] = useState<{ label: string; precio: number } | null>(null);
  const [conIVA, setConIVA] = useState(false);
  const [notas, setNotas] = useState('');
  const [copied, setCopied] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
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
    setItems([...items, { id: String(nextId++), descripcion: '', cantidad: 1, precioUnitario: 0 }]);
  };

  const addCombined = () => {
    if (!selBordado && !selPrenda) return;
    const parts: string[] = [];
    let precio = 0;
    if (selPrenda) { parts.push(selPrenda.label); precio += selPrenda.precio; }
    if (selBordado) { parts.push(selBordado.label); precio += selBordado.precio; }
    const desc = parts.join(' + ');
    setItems([...items, { id: String(nextId++), descripcion: desc, cantidad: 1, precioUnitario: precio }]);
    setSelBordado(null);
    setSelPrenda(null);
  };

  const addCustomItem = () => {
    setItems([...items, { id: String(nextId++), descripcion: '', cantidad: 1, precioUnitario: 0 }]);
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
    const cot: Cotizacion = {
      id: uuid(), folio: getNextFolio('COT'), clienteNombre, clienteEmpresa,
      items: items.filter((i) => i.descripcion && i.precioUnitario > 0).map((i) => ({ descripcion: i.descripcion, cantidad: i.cantidad, precioUnitario: i.precioUnitario })),
      conIVA, notas, subtotal, iva, total, createdAt: new Date().toISOString(),
    };
    addCotizacion(cot);
    setCotizaciones([cot, ...cotizaciones]);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  };

  const loadCotizacion = (c: Cotizacion) => {
    setClienteNombre(c.clienteNombre);
    setClienteEmpresa(c.clienteEmpresa);
    setItems(c.items.map((i, idx) => ({ id: String(nextId++), ...i })));
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
    const validItems = items.filter((i) => i.descripcion && i.precioUnitario > 0);
    let msg = `*STUDIO 24 - COTIZACION*${nl}Fecha: ${today}${nl}`;
    if (clienteNombre) msg += `${nl}Dirigida a: *${clienteNombre}*${nl}`;
    if (clienteEmpresa) msg += `${clienteEmpresa}${nl}`;
    msg += `${nl}*--- DETALLE ---*${nl}`;
    validItems.forEach((i) => {
      msg += `${nl}${i.descripcion}${nl}  ${i.cantidad} x ${formatCurrency(i.precioUnitario)} = *${formatCurrency(i.cantidad * i.precioUnitario)}*${nl}`;
    });
    msg += `${nl}———————————${nl}`;
    msg += `SUBTOTAL: ${formatCurrency(subtotal)}${nl}`;
    if (conIVA) msg += `IVA (16%): ${formatCurrency(iva)}${nl}`;
    msg += `*TOTAL: ${formatCurrency(total)}*${nl}`;
    msg += `${nl}*INFORMACION DE PAGO:*${nl}`;
    if (cfg.titular) msg += `${cfg.titular}${nl}`;
    if (cfg.banco) msg += `${cfg.banco}${nl}`;
    if (cfg.numeroCuenta) msg += `Cuenta: ${cfg.numeroCuenta}${nl}`;
    if (cfg.clabe) msg += `CLABE: ${cfg.clabe}${nl}`;
    if (notas) msg += `${nl}_${notas}_${nl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const imprimirPDF = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Cotizacion - Studio 24</title><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; background: #f0f0f0; padding: 20px; }
      .page { max-width: 800px; margin: 0 auto; background: white; padding: 60px; }
      h1 { font-size: 48px; font-weight: 900; letter-spacing: -2px; text-transform: uppercase; margin-bottom: 8px; }
      .divider { border-top: 2px solid #0a0a0a; margin: 20px 0; }
      .meta { font-size: 13px; color: #666; }
      .meta strong { color: #0a0a0a; }
      table { width: 100%; border-collapse: collapse; margin: 30px 0; }
      th { text-align: left; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #0a0a0a; padding: 8px 0; }
      th:nth-child(2), th:nth-child(3), th:nth-child(4) { text-align: right; }
      td { padding: 10px 0; font-size: 14px; border-bottom: 1px solid #e5e5e5; }
      td:nth-child(2), td:nth-child(3), td:nth-child(4) { text-align: right; }
      .totals { text-align: right; margin: 30px 0; }
      .totals .row { display: flex; justify-content: flex-end; gap: 40px; padding: 8px 0; font-size: 14px; }
      .totals .row.total { font-size: 18px; font-weight: 900; border-top: 2px solid #0a0a0a; padding-top: 12px; }
      .pago { margin-top: 40px; padding-top: 20px; border-top: 2px solid #0a0a0a; }
      .pago h3 { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
      .pago p { font-size: 13px; color: #333; line-height: 1.6; }
      .logo { font-size: 36px; font-weight: 900; color: #c72a09; letter-spacing: -1px; }
      .footer { display: flex; justify-content: space-between; align-items: flex-end; }
      @media print { body { padding: 0; background: white; } .page { padding: 40px; } }
    </style></head><body><div class="page">
      <h1>COTIZACION</h1>
      <div class="divider"></div>
      <div class="meta">
        <p>Fecha: ${today}</p>
        ${clienteNombre ? `<p style="margin-top:16px"><strong>Dirigida a:</strong></p><p>${clienteNombre}</p>` : ''}
        ${clienteEmpresa ? `<p>${clienteEmpresa}</p>` : ''}
      </div>
      <div class="divider"></div>
      <table>
        <thead><tr><th>DESCRIPCION</th><th>CANTIDAD</th><th>PRECIO</th><th>TOTAL</th></tr></thead>
        <tbody>
          ${items.filter((i) => i.descripcion && i.precioUnitario > 0).map((i) => `
            <tr><td>${i.descripcion}</td><td>${i.cantidad}</td><td>$ ${i.precioUnitario.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td><td>$ ${(i.cantidad * i.precioUnitario).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td></tr>
          `).join('')}
        </tbody>
      </table>
      <div class="totals">
        <div class="row"><span>SUBTOTAL</span><span>$ ${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>
        ${conIVA ? `<div class="row"><span>IVA (16%)</span><span>$ ${iva.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>` : ''}
        <div class="row total"><span>TOTAL</span><span>$ ${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>
      </div>
      <div class="pago">
        <div class="footer">
          <div>
            <h3>INFORMACION DE PAGO</h3>
            <p>${cfg.titular}<br>${cfg.banco}<br>${cfg.numeroCuenta ? `Numero de cuenta: ${cfg.numeroCuenta}` : ''}${cfg.clabe ? `<br>Cuenta clabe: ${cfg.clabe}` : ''}</p>
            ${notas ? `<p style="margin-top:12px;color:#666">Notas: ${notas}</p>` : ''}
          </div>
          <div class="logo">${cfg.nombreNegocio || 'STCH'}</div>
        </div>
      </div>
    </div></body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); }, 500);
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
              <div><label className={labelClass}>Empresa / Direccion</label><input type="text" value={clienteEmpresa} onChange={(e) => setClienteEmpresa(e.target.value)} placeholder="Nombre de la empresa" className={inputClass} /></div>
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
                    <button key={p.label} onClick={() => { setItems([...items, { id: String(nextId++), descripcion: p.label, cantidad: 1, precioUnitario: p.precio }]); }} className="px-3 py-2 rounded-xl border border-neutral-200 hover:border-[#c72a09] hover:bg-[#c72a09]/5 transition-all text-left">
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
              <button onClick={addCustomItem} className="bg-[#0a0a0a] text-white px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-[0.05em] uppercase hover:bg-[#222] transition-colors">+ Linea manual</button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={item.id} className="flex gap-3 items-start p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                  <span className="text-[10px] font-bold text-neutral-300 mt-3 w-5 shrink-0">{idx + 1}</span>
                  <div className="flex-1 grid grid-cols-6 gap-3">
                    <div className="col-span-3">
                      <label className="text-[9px] text-neutral-400 font-medium">Descripcion</label>
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
              {savedMsg ? 'Guardada!' : 'Guardar Cotizacion'}
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

            <button onClick={imprimirPDF} className="w-full bg-[#0a0a0a] text-white py-3.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase hover:bg-[#222] transition-colors flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" /></svg>
              Imprimir / PDF
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
