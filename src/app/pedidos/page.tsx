'use client';

/* eslint-disable @next/next/no-img-element */

import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import { getPedidos, getClientes, getIngresos } from '@/lib/store';
import { cloudGetPedidosPage, cloudGetClientes, cloudGetIngresosByYear } from '@/lib/store-cloud';
import { addPedido, updatePedido, deletePedido, addIngreso, getNextFolioAsync } from '@/lib/store-sync';
import { useCloudStore } from '@/lib/useCloudStore';
import Pagination, { PAGE_SIZE } from '@/components/Pagination';
import { Pedido, EstadoPedido, EstadoPago, ConceptoIngreso, FormaPago } from '@/lib/types';
import {
  formatCurrency,
  formatDate,
  conceptoLabel,
  estadoPedidoLabel,
  estadoPedidoColor,
  todayString,
  validatePedido,
} from '@/lib/helpers';
import {
  buildIngresoFromPedido,
  applyPedidoPayment,
  buildPedidoPayment,
  calculateEstadoPago,
  calculatePedidoPaidAmount,
  calculatePedidoTotal,
  canCreateIngresoForPedido,
} from '@/lib/business-rules';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import ActionMenu from '@/components/ActionMenu';
import PhotoGallery from '@/components/PhotoGallery';
import { useRole } from '@/components/RoleProvider';
import { inputClass, labelClass, btnPrimary, btnSecondary } from '@/lib/styles';
import { createTrackingToken, publicTrackingUrl } from '@/lib/tracking';
import { flushPendingSync } from '@/lib/sync-flush';

const conceptos: ConceptoIngreso[] = ['solo_bordado', 'bordado_y_prenda', 'diseno', 'reparacion', 'otro'];
const pipeline: { estado: EstadoPedido; label: string; emoji: string }[] = [
  { estado: 'pendiente', label: 'Pendiente', emoji: '📋' },
  { estado: 'diseno', label: 'En Diseño', emoji: '🎨' },
  { estado: 'aprobado', label: 'Aprobado', emoji: '✅' },
  { estado: 'en_maquina', label: 'En Máquina', emoji: '🧵' },
  { estado: 'terminado', label: 'Terminado', emoji: '📦' },
  { estado: 'entregado', label: 'Entregado', emoji: '🤝' },
];

const emptyChecklist = {
  archivoListo: false,
  hilosCargados: false,
  aroColocado: false,
  estabilizador: false,
  pruebaHecha: false,
};

const pagoColor: Record<EstadoPago, string> = {
  pendiente: 'bg-red-100 text-red-600',
  parcial: 'bg-amber-100 text-amber-700',
  pagado: 'bg-green-100 text-green-700',
};
const pagoLabel: Record<EstadoPago, string> = {
  pendiente: 'Sin pago',
  parcial: 'Parcial',
  pagado: 'Pagado',
};

function emptyPedido(): Omit<Pedido, 'id' | 'createdAt'> {
  return {
    clienteId: '',
    descripcion: '',
    concepto: 'solo_bordado',
    piezas: 1,
    precioUnitario: 0,
    montoTotal: 0,
    costoMateriales: 0,
    estado: 'pendiente',
    estadoPago: 'pendiente',
    montoPagado: 0,
    pagos: [],
    maquina: '',
    archivoDiseno: '',
    fotos: [],
    inventarioUsado: [],
    checklist: { ...emptyChecklist },
    fechaPedido: todayString(),
    fechaEntrega: '',
    fechaEntregaReal: '',
    urgente: false,
    notas: '',
  };
}

const statusMessages: Record<EstadoPedido, string> = {
  pendiente: 'Tu pedido ha sido recibido. Te avisamos cuando empecemos el diseño.',
  diseno: 'Estamos trabajando en el diseño de tu pedido. Te enviaremos una muestra para aprobación.',
  aprobado: '¡El diseño fue aprobado! Tu pedido entrará a producción pronto.',
  en_maquina: 'Tu pedido ya está en producción en nuestra máquina bordadora.',
  terminado: '¡Tu pedido está LISTO! Puedes pasar a recogerlo o coordinamos la entrega.',
  entregado: 'Gracias por tu compra! Esperamos verte pronto.',
  cancelado: 'Tu pedido ha sido cancelado.',
};

export default function PedidosPage() {
  const now = new Date();
  const { data: pedidosRaw, reload: reloadPedidos } = useCloudStore(
    getPedidos,
    () => cloudGetPedidosPage(500),
    'bordados_pedidos',
  );
  const { data: clientes, reload: reloadClientes } = useCloudStore(getClientes, cloudGetClientes, 'bordados_clientes');
  const { data: ingresos, reload: reloadIngresos } = useCloudStore(
    getIngresos,
    () => cloudGetIngresosByYear(now.getFullYear()),
    'bordados_ingresos',
    [now.getFullYear()],
  );
  const pedidos = [...pedidosRaw].sort((a, b) => {
    if (a.urgente && !b.urgente) return -1;
    if (!a.urgente && b.urgente) return 1;
    return b.fechaPedido.localeCompare(a.fechaPedido);
  });
  const reload = () => {
    reloadPedidos();
    reloadClientes();
    reloadIngresos();
  };
  const [modalOpen, setModalOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyPedido());
  const [formSnapshot, setFormSnapshot] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentForma, setPaymentForma] = useState<FormaPago>('transferencia');
  const [paymentReferencia, setPaymentReferencia] = useState('');
  const [view, setView] = useState<'pipeline' | 'lista' | 'pagos'>('pipeline');
  const [page, setPage] = useState(0);
  const { role } = useRole();
  const pagedPedidos = pedidos.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const isClient = typeof window !== 'undefined';
  const [mounted] = useState(() => isClient);

  if (!mounted)
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
      </div>
    );

  const openNew = () => {
    setEditingId(null);
    const initial = emptyPedido();
    setForm(initial);
    setFormSnapshot(JSON.stringify(initial));
    setFormError(null);
    setPaymentAmount('');
    setPaymentReferencia('');
    setPaymentForma('transferencia');
    setModalOpen(true);
  };
  const openEdit = (p: Pedido) => {
    setEditingId(p.id);
    setForm({ ...p, pagos: p.pagos || [], inventarioUsado: p.inventarioUsado || [] });
    setFormSnapshot(JSON.stringify(p));
    setFormError(null);
    setPaymentAmount('');
    setPaymentReferencia('');
    setPaymentForma('transferencia');
    setModalOpen(true);
  };
  const handleSave = () => {
    const error = validatePedido(form);
    if (error) {
      setFormError(error);
      return;
    }
    setFormError(null);
    const montoTotal = calculatePedidoTotal(form);
    const montoPagado = calculatePedidoPaidAmount(form);
    const estadoPago = calculateEstadoPago(montoTotal, montoPagado);
    const data: Pedido = {
      ...(form as Pedido),
      id: editingId || uuid(),
      montoTotal,
      montoPagado,
      estadoPago,
      trackingToken: (form as Pedido).trackingToken || createTrackingToken(),
      createdAt: editingId ? (form as Pedido).createdAt : new Date().toISOString(),
    };
    if (editingId) updatePedido(data);
    else addPedido(data);
    setModalOpen(false);
    reload();
  };
  const addPaymentToForm = () => {
    const amount = parseFloat(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Ingresa un monto de pago válido');
      return;
    }
    const total = calculatePedidoTotal(form);
    const currentPaid = calculatePedidoPaidAmount(form);
    if (currentPaid + amount > total + 0.01) {
      setFormError('El pago excede el total del pedido');
      return;
    }
    const pago = buildPedidoPayment({
      id: uuid(),
      monto: amount,
      formaPago: paymentForma,
      referencia: paymentReferencia.trim(),
    });
    const updated = applyPedidoPayment({ ...form, montoTotal: total }, pago);
    setForm(updated);
    setPaymentAmount('');
    setPaymentReferencia('');
    setFormError(null);
  };
  const handleDelete = (id: string) => {
    if (confirm('Eliminar pedido?')) {
      deletePedido(id);
      reload();
    }
  };
  const moveEstado = async (p: Pedido, estado: EstadoPedido) => {
    const updated = { ...p, estado };
    if (estado === 'entregado') {
      updated.fechaEntregaReal = todayString();
      // If fully paid, offer to create Ingreso
      if (canCreateIngresoForPedido(role, p, ingresos)) {
        if (confirm('Pedido entregado y pagado. ¿Crear ingreso automáticamente?')) {
          const conFactura = confirm('¿Facturar este ingreso? (IVA 16%)');
          await crearIngresoDePedido(p, conFactura);
        }
      }
    }
    updatePedido(updated);
    reload();
  };

  const crearIngresoDePedido = async (p: Pedido, conFactura: boolean) => {
    if (!canCreateIngresoForPedido(role, p, ingresos)) return false;
    const ingreso = buildIngresoFromPedido(p, {
      id: uuid(),
      conFactura,
      numeroFactura: conFactura ? await getNextFolioAsync('ING') : '',
    });
    addIngreso(ingreso);
    reloadIngresos();
    return true;
  };

  const repetirPedido = (p: Pedido) => {
    const nuevo: Pedido = {
      ...p,
      id: uuid(),
      estado: 'pendiente',
      estadoPago: 'pendiente',
      montoPagado: 0,
      pagos: [],
      inventarioUsado: [],
      fechaPedido: todayString(),
      fechaEntrega: '',
      fechaEntregaReal: '',
      fotos: [],
      checklist: { ...emptyChecklist },
      trackingToken: createTrackingToken(),
      createdAt: new Date().toISOString(),
    };
    addPedido(nuevo);
    reload();
  };

  const enviarWhatsAppEstado = (p: Pedido) => {
    const cliente = clientes.find((c) => c.id === p.clienteId);
    const tel = cliente?.telefono?.replace(/\D/g, '') || '';
    const msg = `*STUDIO 24*\n\nHola ${cliente?.nombre || ''}!\n\n${statusMessages[p.estado]}\n\nPedido: ${p.descripcion}\nPiezas: ${p.piezas}\n${p.fechaEntrega ? `Entrega estimada: ${formatDate(p.fechaEntrega)}` : ''}\n\nGracias por tu preferencia!`;
    const url = tel
      ? `https://wa.me/52${tel}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const compartirSeguimiento = async (p: Pedido) => {
    const trackingToken = p.trackingToken || createTrackingToken();
    if (!p.trackingToken) {
      updatePedido({ ...p, trackingToken });
      reloadPedidos();
    }
    try {
      await flushPendingSync();
    } catch {
      // Si no hay conexión, el link queda listo localmente y sincronizará en cuanto vuelva la nube.
    }
    const link = publicTrackingUrl(trackingToken);
    const cliente = clientes.find((c) => c.id === p.clienteId);
    const tel = cliente?.telefono?.replace(/\D/g, '') || '';
    const msg = `*STUDIO 24*\n\nHola ${cliente?.nombre || ''}! Aquí puedes ver el estado de tu pedido:\n\n${link}\n\nPedido: ${p.descripcion}`;
    const waUrl = tel
      ? `https://wa.me/52${tel}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
  };

  const imprimirOrdenTrabajo = async (p: Pedido) => {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF('p', 'mm', 'letter');
    const w = doc.internal.pageSize.getWidth();
    const cliente = clientes.find((c) => c.id === p.clienteId);
    let y = 20;

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.text('ORDEN DE TRABAJO', 20, y);
    y += 4;
    doc.setDrawColor(199, 42, 9);
    doc.setLineWidth(1);
    doc.line(20, y, 80, y);
    y += 10;

    // Badges
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Estado: ${estadoPedidoLabel(p.estado).toUpperCase()}`, 20, y);
    if (p.urgente) {
      doc.setTextColor(199, 42, 9);
      doc.text('URGENTE', w - 20, y, { align: 'right' });
    }
    doc.setTextColor(10);
    y += 10;

    // Info grid
    doc.setDrawColor(220);
    doc.setLineWidth(0.3);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120);

    const field = (label: string, value: string, x: number, yy: number) => {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120);
      doc.setFontSize(7);
      doc.text(label.toUpperCase(), x, yy);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(10);
      doc.setFontSize(10);
      doc.text(value || '—', x, yy + 5);
    };

    field('Cliente', cliente?.nombre || 'Sin asignar', 20, y);
    field('Teléfono', cliente?.telefono || '—', 110, y);
    y += 15;
    field('Descripción', p.descripcion, 20, y);
    y += 15;
    field('Concepto', conceptoLabel(p.concepto), 20, y);
    field('Piezas', String(p.piezas), 80, y);
    field('Precio Unitario', formatCurrency(p.precioUnitario), 110, y);
    field('Total', formatCurrency(p.montoTotal), 160, y);
    y += 15;
    field('Fecha Pedido', formatDate(p.fechaPedido), 20, y);
    field('Fecha Entrega', p.fechaEntrega ? formatDate(p.fechaEntrega) : 'Sin definir', 80, y);
    field('Máquina', p.maquina || 'Sin asignar', 140, y);
    y += 15;
    if (p.archivoDiseno) {
      field('Archivo de diseño', p.archivoDiseno, 20, y);
      y += 15;
    }

    // Separator
    doc.line(20, y, w - 20, y);
    y += 8;

    // Payment status
    const montoPagado = calculatePedidoPaidAmount(p);
    const pagoTexto =
      p.estadoPago === 'pagado'
        ? 'PAGADO'
        : p.estadoPago === 'parcial'
          ? `PARCIAL — ${formatCurrency(montoPagado)} de ${formatCurrency(p.montoTotal)}`
          : 'PENDIENTE DE PAGO';
    field('Estado de Pago', pagoTexto, 20, y);
    if (p.costoMateriales > 0) {
      field('Costo Materiales', formatCurrency(p.costoMateriales), 110, y);
    }
    y += 18;

    // Checklist
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(10);
    doc.text('CHECKLIST DE PRODUCCIÓN', 20, y);
    y += 7;

    const checks = [
      { label: 'Archivo listo para bordar', done: p.checklist.archivoListo },
      { label: 'Hilos cargados', done: p.checklist.hilosCargados },
      { label: 'Aro colocado', done: p.checklist.aroColocado },
      { label: 'Estabilizador puesto', done: p.checklist.estabilizador },
      { label: 'Prueba realizada', done: p.checklist.pruebaHecha },
    ];

    doc.setFontSize(10);
    for (const check of checks) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(10);
      const box = check.done ? '☑' : '☐';
      doc.text(`${box}  ${check.label}`, 24, y);
      y += 7;
    }

    y += 5;
    doc.line(20, y, w - 20, y);
    y += 8;

    // Notes
    if (p.notas) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text('NOTAS', 20, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(10);
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(p.notas, w - 40);
      doc.text(lines, 20, y);
      y += lines.length * 5;
    }

    // Footer
    const footerY = doc.internal.pageSize.getHeight() - 15;
    doc.setFontSize(7);
    doc.setTextColor(180);
    doc.setFont('helvetica', 'normal');
    doc.text(`STUDIO 24 — Orden generada el ${new Date().toLocaleDateString('es-MX')}`, 20, footerY);

    doc.save(`orden_${p.descripcion.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}.pdf`);
  };

  const addFotoUrl = (p: Pedido, url: string) => {
    if (!url) return;
    const updated = { ...p, fotos: [...(p.fotos || []), url] };
    updatePedido(updated);
    reload();
  };

  const toggleCheck = (p: Pedido, key: keyof typeof emptyChecklist) => {
    const updated = { ...p, checklist: { ...p.checklist, [key]: !p.checklist[key] } };
    updatePedido(updated);
    reload();
  };
  const nextEstado = (current: EstadoPedido): EstadoPedido | null => {
    const idx = pipeline.findIndex((s) => s.estado === current);
    return idx >= 0 && idx < pipeline.length - 1 ? pipeline[idx + 1].estado : null;
  };
  const clienteName = (id: string) => clientes.find((c) => c.id === id)?.nombre || 'Sin cliente';

  const activos = pedidos.filter((p) => p.estado !== 'entregado' && p.estado !== 'cancelado');
  const totalActivos = activos.reduce((s, p) => s + p.montoTotal, 0);

  const checklistLabels: Record<string, string> = {
    archivoListo: 'Archivo cargado en USB',
    hilosCargados: 'Hilos correctos cargados',
    aroColocado: 'Aro colocado',
    estabilizador: 'Estabilizador puesto',
    pruebaHecha: 'Prueba de bordado hecha',
  };

  return (
    <div>
      <PageHeader
        title="Pedidos"
        description={`${activos.length} activos · ${formatCurrency(totalActivos)} en producción`}
        action={
          <div className="flex gap-2">
            <div className="flex bg-neutral-100 rounded-xl p-0.5">
              {(['pipeline', 'lista', 'pagos'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-colors ${view === v ? 'bg-white text-[#0a0a0a] shadow-sm' : 'text-neutral-400'}`}
                >
                  {v === 'pagos' ? 'Pagos' : v === 'pipeline' ? 'Pipeline' : 'Lista'}
                </button>
              ))}
            </div>
            <button onClick={openNew} className={btnPrimary}>
              + Nuevo
            </button>
          </div>
        }
      />

      {/* Pipeline View */}
      {view === 'pipeline' && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {pipeline.map((col) => {
            const items = pedidos.filter((p) => p.estado === col.estado);
            return (
              <div key={col.estado} className="bg-neutral-50 rounded-2xl p-3 min-h-[200px]">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className="text-sm">{col.emoji}</span>
                  <span className="text-[10px] font-bold tracking-[0.08em] text-neutral-400 uppercase">
                    {col.label}
                  </span>
                  <span className="ml-auto text-[10px] font-bold text-neutral-300 bg-white rounded-full w-5 h-5 flex items-center justify-center">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {items.map((p) => (
                    <div
                      key={p.id}
                      className={`bg-white rounded-xl p-3 border transition-all hover:shadow-md ${p.urgente ? 'border-[#c72a09]/30' : 'border-neutral-100'}`}
                    >
                      {p.urgente && (
                        <span className="text-[9px] font-bold text-[#c72a09] uppercase tracking-wide">Urgente</span>
                      )}
                      <p className="text-xs font-semibold text-[#0a0a0a] mt-0.5 leading-tight">{p.descripcion}</p>
                      <p className="text-[10px] text-neutral-400 mt-1">{clienteName(p.clienteId)}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${pagoColor[p.estadoPago || 'pendiente']}`}
                        >
                          {pagoLabel[p.estadoPago || 'pendiente']}
                        </span>
                        <span className="text-xs font-bold text-[#0a0a0a]">{formatCurrency(p.montoTotal)}</span>
                      </div>
                      {p.costoMateriales > 0 && (
                        <p className="text-[10px] text-neutral-300 mt-1">
                          Ganancia:{' '}
                          <span className="text-green-600 font-bold">
                            {formatCurrency(p.montoTotal - p.costoMateriales)}
                          </span>
                        </p>
                      )}
                      {p.archivoDiseno && (
                        <p className="text-[10px] text-neutral-300 mt-1 truncate">📄 {p.archivoDiseno}</p>
                      )}
                      {(p.fotos || []).length > 0 && (
                        <div className="flex gap-1 mt-1.5">
                          {(p.fotos || []).slice(0, 3).map((f, i) => (
                            <img key={i} src={f} alt="" className="w-8 h-8 rounded-lg object-cover" />
                          ))}
                          {(p.fotos || []).length > 3 && (
                            <span className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-[9px] font-bold text-neutral-400">
                              +{(p.fotos || []).length - 3}
                            </span>
                          )}
                        </div>
                      )}
                      {p.fechaEntrega && (
                        <p
                          className={`text-[10px] mt-1 font-semibold ${new Date(p.fechaEntrega) < new Date() && p.estado !== 'entregado' ? 'text-red-500' : 'text-neutral-300'}`}
                        >
                          Entrega: {formatDate(p.fechaEntrega)}
                        </p>
                      )}
                      {/* Checklist toggle for en_maquina */}
                      {(p.estado === 'en_maquina' || p.estado === 'aprobado') && (
                        <div className="mt-2">
                          <button
                            onClick={() => setChecklistOpen(checklistOpen === p.id ? null : p.id)}
                            className="text-[9px] font-bold text-blue-600 uppercase tracking-wide"
                          >
                            {Object.values(p.checklist || emptyChecklist).filter(Boolean).length}/5 Checklist
                          </button>
                          {checklistOpen === p.id && (
                            <div className="mt-1.5 space-y-1">
                              {Object.entries(p.checklist || emptyChecklist).map(([key, val]) => (
                                <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={val}
                                    onChange={() => toggleCheck(p, key as keyof typeof emptyChecklist)}
                                    className="w-3 h-3 accent-[#c72a09] rounded"
                                  />
                                  <span
                                    className={`text-[10px] ${val ? 'text-green-600 line-through' : 'text-neutral-500'}`}
                                  >
                                    {checklistLabels[key]}
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {/* Photos */}
                      <div className="mt-2">
                        <PhotoGallery pedidoId={p.id} />
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-neutral-50">
                        {nextEstado(p.estado) ? (
                          <button
                            onClick={() => moveEstado(p, nextEstado(p.estado)!)}
                            className="text-[10px] font-bold text-[#c72a09] hover:underline uppercase tracking-wide"
                          >
                            → {estadoPedidoLabel(nextEstado(p.estado)!)}
                          </button>
                        ) : (
                          <span />
                        )}
                        <ActionMenu
                          items={[
                            { label: 'Editar', onClick: () => openEdit(p) },
                            { label: 'Imprimir orden', onClick: () => imprimirOrdenTrabajo(p) },
                            { label: 'Enviar seguimiento', onClick: () => compartirSeguimiento(p) },
                            { label: 'WhatsApp al cliente', onClick: () => enviarWhatsAppEstado(p) },
                            { label: 'Repetir pedido', onClick: () => repetirPedido(p) },
                            {
                              label: 'Agregar foto (URL)',
                              onClick: () => {
                                const url = prompt('URL de la foto:');
                                if (url) addFotoUrl(p, url);
                              },
                            },
                            ...(p.estado !== 'cancelado'
                              ? [{ label: 'Cancelar', onClick: () => moveEstado(p, 'cancelado'), danger: true }]
                              : []),
                            { label: 'Eliminar', onClick: () => handleDelete(p.id), danger: true },
                          ]}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {view === 'lista' &&
        (pedidos.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-sm text-neutral-300">Sin pedidos</p>
            <button
              onClick={openNew}
              className="text-[#c72a09] font-bold text-xs uppercase tracking-wide hover:underline mt-3"
            >
              + Crear pedido
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-neutral-100 overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                    Pedido
                  </th>
                  <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                    Cliente
                  </th>
                  <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                    Estado
                  </th>
                  <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                    Pago
                  </th>
                  <th className="px-5 py-4 text-right text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                    Monto
                  </th>
                  <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                    Entrega
                  </th>
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>
              <tbody>
                {pagedPedidos.map((p) => (
                  <tr key={p.id} className="border-b border-neutral-50 hover:bg-neutral-50/50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {p.urgente && <span className="w-2 h-2 rounded-full bg-[#c72a09] shrink-0" />}
                        <div>
                          <span className="font-semibold text-[#0a0a0a]">{p.descripcion}</span>
                          <span className="block text-[10px] text-neutral-300 mt-0.5">
                            {p.piezas} pzas &middot; {conceptoLabel(p.concepto)}
                            {p.archivoDiseno ? ` · 📄 ${p.archivoDiseno}` : ''}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-neutral-400">{clienteName(p.clienteId)}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide ${estadoPedidoColor(p.estado)}`}
                      >
                        {estadoPedidoLabel(p.estado)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide ${pagoColor[p.estadoPago || 'pendiente']}`}
                      >
                        {pagoLabel[p.estadoPago || 'pendiente']}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-bold text-[#0a0a0a]">{formatCurrency(p.montoTotal)}</td>
                    <td className="px-5 py-4 text-xs text-neutral-400">
                      {p.fechaEntrega ? formatDate(p.fechaEntrega) : '—'}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end">
                        <ActionMenu
                          items={[
                            { label: 'Editar', onClick: () => openEdit(p) },
                            ...(nextEstado(p.estado)
                              ? [
                                  {
                                    label: `→ ${estadoPedidoLabel(nextEstado(p.estado)!)}`,
                                    onClick: () => moveEstado(p, nextEstado(p.estado)!),
                                  },
                                ]
                              : []),
                            { label: 'WhatsApp al cliente', onClick: () => enviarWhatsAppEstado(p) },
                            { label: 'Repetir pedido', onClick: () => repetirPedido(p) },
                            { label: 'Eliminar', onClick: () => handleDelete(p.id), danger: true },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {view === 'lista' && <Pagination total={pedidos.length} page={page} onPageChange={setPage} />}

      {/* Pagos View */}
      {view === 'pagos' && (
        <div>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {(['pendiente', 'parcial', 'pagado'] as const).map((ep) => {
              const items = pedidos.filter((p) => (p.estadoPago || 'pendiente') === ep && p.estado !== 'cancelado');
              const total = items.reduce((s, p) => s + p.montoTotal, 0);
              const pagado = items.reduce((s, p) => s + calculatePedidoPaidAmount(p), 0);
              return (
                <div
                  key={ep}
                  className={`rounded-2xl p-5 border ${ep === 'pendiente' ? 'bg-red-50 border-red-100' : ep === 'parcial' ? 'bg-amber-50 border-amber-100' : 'bg-green-50 border-green-100'}`}
                >
                  <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-neutral-400">{pagoLabel[ep]}</p>
                  <p className="text-2xl font-black mt-1">{items.length} pedidos</p>
                  <p className="text-xs text-neutral-500 mt-1">
                    Total: {formatCurrency(total)} {ep === 'parcial' && `· Cobrado: ${formatCurrency(pagado)}`}
                  </p>
                  {ep !== 'pagado' && total > 0 && (
                    <p className="text-xs font-bold text-[#c72a09] mt-1">
                      Por cobrar: {formatCurrency(total - pagado)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {/* Pagos table */}
          <div className="bg-white rounded-2xl border border-neutral-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                    Cliente
                  </th>
                  <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                    Pedido
                  </th>
                  <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                    Estado
                  </th>
                  <th className="px-5 py-4 text-right text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                    Total
                  </th>
                  <th className="px-5 py-4 text-right text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                    Pagado
                  </th>
                  <th className="px-5 py-4 text-right text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                    Debe
                  </th>
                  <th className="px-5 py-4 text-left text-[10px] font-bold tracking-[0.1em] text-neutral-400 uppercase">
                    Pago
                  </th>
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>
              <tbody>
                {pedidos
                  .filter((p) => p.estado !== 'cancelado')
                  .sort((a, b) => {
                    const order: Record<string, number> = { pendiente: 0, parcial: 1, pagado: 2 };
                    return (order[a.estadoPago || 'pendiente'] || 0) - (order[b.estadoPago || 'pendiente'] || 0);
                  })
                  .map((p) => {
                    const montoPagado = calculatePedidoPaidAmount(p);
                    const debe = p.montoTotal - montoPagado;
                    return (
                      <tr key={p.id} className="border-b border-neutral-50 hover:bg-neutral-50/50">
                        <td className="px-5 py-4 text-xs font-semibold text-[#0a0a0a]">{clienteName(p.clienteId)}</td>
                        <td className="px-5 py-4 text-xs text-neutral-500">{p.descripcion}</td>
                        <td className="px-5 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide ${estadoPedidoColor(p.estado)}`}
                          >
                            {estadoPedidoLabel(p.estado)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right text-xs font-bold">{formatCurrency(p.montoTotal)}</td>
                        <td className="px-5 py-4 text-right text-xs font-bold text-green-600">
                          {formatCurrency(montoPagado)}
                        </td>
                        <td className="px-5 py-4 text-right text-xs font-bold text-red-500">
                          {debe > 0 ? formatCurrency(debe) : '—'}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide ${pagoColor[p.estadoPago || 'pendiente']}`}
                          >
                            {pagoLabel[p.estadoPago || 'pendiente']}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end">
                            <ActionMenu
                              items={[
                                { label: 'Editar', onClick: () => openEdit(p) },
                                { label: 'Imprimir orden', onClick: () => imprimirOrdenTrabajo(p) },
                                ...(canCreateIngresoForPedido(role, p, ingresos)
                                  ? [
                                      {
                                        label: 'Crear Ingreso',
                                        onClick: async () => {
                                          const conFactura = confirm('¿Facturar este ingreso? (IVA 16%)');
                                          const created = await crearIngresoDePedido(p, conFactura);
                                          alert(created ? 'Ingreso creado!' : 'Este pedido ya tiene un ingreso.');
                                        },
                                      },
                                    ]
                                  : []),
                                { label: 'Eliminar', onClick: () => handleDelete(p.id), danger: true },
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar Pedido' : 'Nuevo Pedido'}
        dirty={JSON.stringify(form) !== formSnapshot}
      >
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Descripción *</label>
            <input
              type="text"
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Ej: 20 playeras con logo bordado"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Cliente</label>
              <select
                value={form.clienteId}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    window.open('/studio24/clientes', '_blank');
                    return;
                  }
                  setForm({ ...form, clienteId: e.target.value });
                }}
                className={inputClass}
              >
                <option value="">Sin cliente</option>
                <option value="__new__">+ Nuevo cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Concepto</label>
              <select
                value={form.concepto}
                onChange={(e) => setForm({ ...form, concepto: e.target.value as ConceptoIngreso })}
                className={inputClass}
              >
                {conceptos.map((c) => (
                  <option key={c} value={c}>
                    {conceptoLabel(c)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Piezas</label>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                value={form.piezas}
                onChange={(e) => setForm({ ...form, piezas: Math.max(1, parseInt(e.target.value) || 1) })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Precio unitario</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={form.precioUnitario || ''}
                onChange={(e) => setForm({ ...form, precioUnitario: parseFloat(e.target.value) || 0 })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Total</label>
              <div className="h-[42px] flex items-center text-lg font-black text-[#c72a09]">
                {formatCurrency(form.piezas * form.precioUnitario)}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Fecha de pedido</label>
              <input
                type="date"
                value={form.fechaPedido}
                onChange={(e) => setForm({ ...form, fechaPedido: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Fecha de entrega</label>
              <input
                type="date"
                value={form.fechaEntrega}
                onChange={(e) => setForm({ ...form, fechaEntrega: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Estado</label>
              <select
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoPedido })}
                className={inputClass}
              >
                {pipeline.map((s) => (
                  <option key={s.estado} value={s.estado}>
                    {s.label}
                  </option>
                ))}
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Máquina</label>
              <select
                value={form.maquina}
                onChange={(e) => setForm({ ...form, maquina: e.target.value })}
                className={inputClass}
              >
                <option value="">Sin asignar</option>
                <option value="Tajima SAI #1">Tajima SAI #1</option>
                <option value="Tajima SAI #2">Tajima SAI #2</option>
              </select>
            </div>
          </div>

          {/* Archivo de diseño */}
          <div>
            <label className={labelClass}>Archivo de diseño (.dst, .tbf)</label>
            <input
              type="text"
              value={form.archivoDiseno}
              onChange={(e) => setForm({ ...form, archivoDiseno: e.target.value })}
              placeholder="Ej: logo_empresa.dst"
              className={inputClass}
            />
          </div>

          {/* Pago */}
          <div className="bg-neutral-50 rounded-xl p-4">
            <h4 className={labelClass}>Pago</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              <div>
                <label className="text-[10px] text-neutral-400 font-medium">Total pagado</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={calculatePedidoPaidAmount(form) || ''}
                  onChange={(e) => {
                    const montoPagado = parseFloat(e.target.value) || 0;
                    setForm({
                      ...form,
                      pagos: [],
                      montoPagado,
                      estadoPago: calculateEstadoPago(form.piezas * form.precioUnitario, montoPagado),
                    });
                  }}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-[10px] text-neutral-400 font-medium">
                  de {formatCurrency(form.piezas * form.precioUnitario)}
                </label>
                <div className="h-[42px] flex items-center">
                  <span
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase ${calculatePedidoPaidAmount(form) >= form.piezas * form.precioUnitario && form.piezas * form.precioUnitario > 0 ? 'bg-green-100 text-green-700' : calculatePedidoPaidAmount(form) > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}
                  >
                    {calculatePedidoPaidAmount(form) >= form.piezas * form.precioUnitario &&
                    form.piezas * form.precioUnitario > 0
                      ? 'Pagado'
                      : calculatePedidoPaidAmount(form) > 0
                        ? 'Parcial'
                        : 'Sin pago'}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 border-t border-neutral-200/70 pt-4">
              <p className="text-[10px] font-bold tracking-[0.08em] text-neutral-400 uppercase mb-2">
                Historial de pagos
              </p>
              {(form.pagos || []).length > 0 ? (
                <div className="space-y-1.5 mb-3">
                  {(form.pagos || []).map((pago) => (
                    <div key={pago.id} className="flex items-center justify-between text-xs">
                      <span className="text-neutral-500">
                        {formatDate(pago.fecha)} · {pago.formaPago}
                        {pago.referencia ? ` · ${pago.referencia}` : ''}
                      </span>
                      <span className="font-bold text-[#0a0a0a]">{formatCurrency(pago.monto)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-neutral-300 mb-3">Sin pagos detallados todavía</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Monto"
                  className={inputClass}
                />
                <select
                  value={paymentForma}
                  onChange={(e) => setPaymentForma(e.target.value as FormaPago)}
                  className={inputClass}
                >
                  <option value="transferencia">Transferencia</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="otro">Otro</option>
                </select>
                <input
                  type="text"
                  value={paymentReferencia}
                  onChange={(e) => setPaymentReferencia(e.target.value)}
                  placeholder="Referencia"
                  className={`${inputClass} sm:col-span-2`}
                />
                <button
                  type="button"
                  onClick={addPaymentToForm}
                  className="sm:col-span-2 px-4 py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase border border-neutral-200 text-neutral-600 hover:border-[#c72a09] hover:text-[#c72a09] transition-colors"
                >
                  Agregar pago
                </button>
              </div>
            </div>
          </div>

          {/* Costo de materiales */}
          <div className="bg-neutral-50 rounded-xl p-4">
            <h4 className={labelClass}>Costo de Materiales</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-2">
              <div>
                <label className="text-[10px] text-neutral-400 font-medium">Costo materiales</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={form.costoMateriales || ''}
                  onChange={(e) => setForm({ ...form, costoMateriales: parseFloat(e.target.value) || 0 })}
                  placeholder="Hilos, tela, etc."
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-[10px] text-neutral-400 font-medium">Venta total</label>
                <div className="h-[42px] flex items-center text-sm font-bold">
                  {formatCurrency(form.piezas * form.precioUnitario)}
                </div>
              </div>
              <div>
                <label className="text-[10px] text-neutral-400 font-medium">Ganancia</label>
                <div className="h-[42px] flex items-center text-sm font-bold text-green-600">
                  {formatCurrency(form.piezas * form.precioUnitario - (form.costoMateriales || 0))}
                </div>
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.urgente}
              onChange={(e) => setForm({ ...form, urgente: e.target.checked })}
              className="w-4 h-4 accent-[#c72a09] rounded"
            />
            <span className="text-sm font-semibold text-[#0a0a0a]">Urgente</span>
          </label>
          <div>
            <label className={labelClass}>Notas</label>
            <textarea
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              rows={2}
              placeholder="Colores, posiciones, detalles..."
              className={inputClass}
            />
          </div>

          {/* Fotos */}
          {editingId && (
            <div>
              <label className={labelClass}>Fotos del trabajo</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {(form.fotos || []).map((f, i) => (
                  <div key={i} className="relative group">
                    <img src={f} alt="" className="w-16 h-16 rounded-xl object-cover" />
                    <button
                      onClick={() => setForm({ ...form, fotos: (form.fotos || []).filter((_, idx) => idx !== i) })}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="URL de la foto"
                  className={`${inputClass} flex-1`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = (e.target as HTMLInputElement).value;
                      if (val) {
                        setForm({ ...form, fotos: [...(form.fotos || []), val] });
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                />
                <span className="text-[10px] text-neutral-400 self-center">Enter para agregar</span>
              </div>
            </div>
          )}
          {formError && (
            <p className="text-xs text-red-500 font-semibold bg-red-50 rounded-xl px-3.5 py-2.5">{formError}</p>
          )}
          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
            <button onClick={() => setModalOpen(false)} className={btnSecondary}>
              Cancelar
            </button>
            <button onClick={handleSave} className={btnPrimary}>
              {editingId ? 'Guardar' : 'Crear Pedido'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
