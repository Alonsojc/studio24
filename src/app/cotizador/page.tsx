'use client';

import { useState } from 'react';
import { formatCurrency, calcIVA } from '@/lib/helpers';
import PageHeader from '@/components/PageHeader';

const inputClass = "w-full border border-neutral-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#c72a09] focus:ring-1 focus:ring-[#c72a09]/20 transition-colors";
const labelClass = "block text-[10px] font-bold tracking-[0.08em] text-neutral-400 uppercase mb-1.5";

const precios = {
  bordado_pequeno: { label: 'Pequeno (< 5cm)', precio: 35 },
  bordado_mediano: { label: 'Mediano (5-10cm)', precio: 65 },
  bordado_grande: { label: 'Grande (10-20cm)', precio: 120 },
  bordado_espalda: { label: 'Espalda completa', precio: 200 },
};

const prendas = {
  ninguna: { label: 'Cliente proporciona prenda', precio: 0 },
  playera_polo: { label: 'Playera Polo', precio: 120 },
  playera_cuello: { label: 'Playera cuello redondo', precio: 80 },
  camisa: { label: 'Camisa', precio: 150 },
  gorra: { label: 'Gorra', precio: 70 },
  mandil: { label: 'Mandil', precio: 90 },
  chamarra: { label: 'Chamarra', precio: 280 },
  overol: { label: 'Overol', precio: 250 },
  otro: { label: 'Otra prenda (precio manual)', precio: 0 },
};

export default function CotizadorPage() {
  const [tamano, setTamano] = useState<keyof typeof precios>('bordado_mediano');
  const [prenda, setPrenda] = useState<keyof typeof prendas>('ninguna');
  const [prendaPrecioManual, setPrendaPrecioManual] = useState(0);
  const [piezas, setPiezas] = useState(1);
  const [posiciones, setPosiciones] = useState(1);
  const [urgente, setUrgente] = useState(false);
  const [conFactura, setConFactura] = useState(false);
  const [descuento, setDescuento] = useState(0);
  const [clienteNombre, setClienteNombre] = useState('');
  const [notas, setNotas] = useState('');
  const [copied, setCopied] = useState(false);

  const precioBordado = precios[tamano].precio * posiciones;
  const precioPrenda = prenda === 'otro' ? prendaPrecioManual : prendas[prenda].precio;
  const subtotalUnitario = precioBordado + precioPrenda;

  const descuentoPct = piezas >= 50 ? 15 : piezas >= 20 ? 10 : piezas >= 10 ? 5 : 0;
  const descuentoTotal = descuento > 0 ? descuento : descuentoPct;

  const subtotal = subtotalUnitario * piezas;
  const montoDescuento = subtotal * (descuentoTotal / 100);
  const subtotalConDesc = subtotal - montoDescuento;
  const iva = conFactura ? calcIVA(subtotalConDesc) : 0;
  const total = subtotalConDesc + iva;
  const urgenteFee = urgente ? total * 0.25 : 0;
  const totalFinal = total + urgenteFee;

  const generarTexto = () => {
    const lines = [
      `*STUDIO 24 - Cotizacion*`,
      ``,
      clienteNombre ? `Cliente: ${clienteNombre}` : '',
      `Fecha: ${new Date().toLocaleDateString('es-MX')}`,
      ``,
      `*Detalle:*`,
      `Bordado: ${precios[tamano].label}${posiciones > 1 ? ` x${posiciones} posiciones` : ''}`,
      prenda !== 'ninguna' ? `Prenda: ${prenda === 'otro' ? 'Personalizada' : prendas[prenda].label}` : 'Prenda: Proporcionada por el cliente',
      `Piezas: ${piezas}`,
      ``,
      `*Precio unitario:* ${formatCurrency(subtotalUnitario)}`,
      `*Subtotal:* ${formatCurrency(subtotal)}`,
      descuentoTotal > 0 ? `Descuento (${descuentoTotal}%): -${formatCurrency(montoDescuento)}` : '',
      conFactura ? `IVA (16%): ${formatCurrency(iva)}` : '',
      urgente ? `Urgencia (25%): +${formatCurrency(urgenteFee)}` : '',
      ``,
      `*TOTAL: ${formatCurrency(totalFinal)}*`,
      conFactura ? `(Incluye IVA)` : `(Sin factura)`,
      ``,
      notas ? `Notas: ${notas}` : '',
      ``,
      `Tiempo estimado: ${urgente ? '1-2 dias' : piezas > 20 ? '5-7 dias' : '3-5 dias'}`,
    ].filter(Boolean).join('\n');
    return lines;
  };

  const copiarTexto = () => {
    navigator.clipboard.writeText(generarTexto());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const enviarWhatsApp = () => {
    const text = encodeURIComponent(generarTexto());
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return (
    <div>
      <PageHeader title="Cotizador" description="Calcula precios al instante y envia por WhatsApp" />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Form */}
        <div className="lg:col-span-3 space-y-6">
          {/* Client */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-6">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-4">Cliente</h3>
            <input type="text" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} placeholder="Nombre del cliente (opcional)" className={inputClass} />
          </div>

          {/* Bordado */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-6">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-4">Bordado</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {(Object.entries(precios) as [keyof typeof precios, { label: string; precio: number }][]).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setTamano(key)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    tamano === key
                      ? 'border-[#c72a09] bg-[#c72a09]/5'
                      : 'border-neutral-100 hover:border-neutral-300'
                  }`}
                >
                  <p className={`text-xs font-semibold ${tamano === key ? 'text-[#c72a09]' : 'text-[#0a0a0a]'}`}>{val.label}</p>
                  <p className="text-lg font-black text-[#0a0a0a] mt-0.5">{formatCurrency(val.precio)}</p>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Posiciones de bordado</label>
                <select value={posiciones} onChange={(e) => setPosiciones(Number(e.target.value))} className={inputClass}>
                  <option value={1}>1 (ej: pecho)</option>
                  <option value={2}>2 (ej: pecho + manga)</option>
                  <option value={3}>3 (ej: pecho + 2 mangas)</option>
                  <option value={4}>4</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Cantidad de piezas</label>
                <input type="number" min="1" value={piezas} onChange={(e) => setPiezas(Math.max(1, parseInt(e.target.value) || 1))} className={inputClass} />
                {descuentoPct > 0 && (
                  <p className="text-[10px] text-green-600 font-bold mt-1">Descuento por volumen: {descuentoPct}%</p>
                )}
              </div>
            </div>
          </div>

          {/* Prenda */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-6">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-4">Prenda</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.entries(prendas) as [keyof typeof prendas, { label: string; precio: number }][]).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setPrenda(key)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    prenda === key
                      ? 'border-[#c72a09] bg-[#c72a09]/5'
                      : 'border-neutral-100 hover:border-neutral-300'
                  }`}
                >
                  <p className={`text-[11px] font-semibold ${prenda === key ? 'text-[#c72a09]' : 'text-[#0a0a0a]'}`}>{val.label}</p>
                  {val.precio > 0 && <p className="text-xs font-bold text-neutral-400 mt-0.5">{formatCurrency(val.precio)}</p>}
                </button>
              ))}
            </div>
            {prenda === 'otro' && (
              <div className="mt-3">
                <label className={labelClass}>Precio de la prenda</label>
                <input type="number" min="0" step="0.01" value={prendaPrecioManual || ''} onChange={(e) => setPrendaPrecioManual(parseFloat(e.target.value) || 0)} className={inputClass} />
              </div>
            )}
          </div>

          {/* Opciones */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-6">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-4">Opciones</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} className="w-4 h-4 accent-[#c72a09] rounded" />
                <div>
                  <span className="text-sm font-semibold text-[#0a0a0a]">Urgente (+25%)</span>
                  <span className="text-xs text-neutral-400 ml-2">Entrega en 1-2 dias</span>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={conFactura} onChange={(e) => setConFactura(e.target.checked)} className="w-4 h-4 accent-[#c72a09] rounded" />
                <div>
                  <span className="text-sm font-semibold text-[#0a0a0a]">Con factura (+16% IVA)</span>
                </div>
              </label>
              <div>
                <label className={labelClass}>Descuento manual (%)</label>
                <input type="number" min="0" max="100" value={descuento || ''} onChange={(e) => setDescuento(parseFloat(e.target.value) || 0)} placeholder={descuentoPct > 0 ? `Auto: ${descuentoPct}%` : '0'} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Notas</label>
                <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder="Detalles adicionales..." className={inputClass} />
              </div>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="lg:col-span-2">
          <div className="sticky top-8 space-y-4">
            <div className="bg-[#0a0a0a] rounded-2xl p-6 text-white">
              <h3 className="text-[10px] font-bold tracking-[0.12em] text-white/30 uppercase mb-5">Resumen</h3>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Bordado ({precios[tamano].label}){posiciones > 1 ? ` x${posiciones}` : ''}</span>
                  <span className="font-semibold">{formatCurrency(precioBordado)}</span>
                </div>
                {prenda !== 'ninguna' && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Prenda</span>
                    <span className="font-semibold">{formatCurrency(precioPrenda)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm border-t border-white/10 pt-3">
                  <span className="text-white/50">Precio unitario</span>
                  <span className="font-bold">{formatCurrency(subtotalUnitario)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">x {piezas} piezas</span>
                  <span className="font-semibold">{formatCurrency(subtotal)}</span>
                </div>
                {descuentoTotal > 0 && (
                  <div className="flex justify-between text-sm text-green-400">
                    <span>Descuento ({descuentoTotal}%)</span>
                    <span className="font-semibold">-{formatCurrency(montoDescuento)}</span>
                  </div>
                )}
                {conFactura && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">IVA (16%)</span>
                    <span className="font-semibold">{formatCurrency(iva)}</span>
                  </div>
                )}
                {urgente && (
                  <div className="flex justify-between text-sm text-amber-400">
                    <span>Urgencia (25%)</span>
                    <span className="font-semibold">+{formatCurrency(urgenteFee)}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-white/10 pt-4">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] font-bold tracking-[0.1em] text-white/30 uppercase">Total</span>
                  <span className="text-3xl font-black text-[#c72a09]">{formatCurrency(totalFinal)}</span>
                </div>
                <p className="text-[10px] text-white/20 mt-1 text-right">
                  {formatCurrency(totalFinal / piezas)} por pieza
                </p>
              </div>

              <p className="text-xs text-white/30 mt-4">
                Entrega estimada: {urgente ? '1-2 dias' : piezas > 20 ? '5-7 dias' : '3-5 dias'}
              </p>
            </div>

            {/* Actions */}
            <button
              onClick={enviarWhatsApp}
              className="w-full bg-[#25D366] text-white py-3.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase hover:bg-[#20bd5a] transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              Enviar por WhatsApp
            </button>

            <button
              onClick={copiarTexto}
              className={`w-full py-3.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase transition-colors border ${
                copied
                  ? 'bg-green-50 text-green-600 border-green-200'
                  : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-400'
              }`}
            >
              {copied ? 'Copiado!' : 'Copiar texto'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
