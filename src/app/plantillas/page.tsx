'use client';

import { useState, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import {
  getPlantillas,
  addPlantilla,
  updatePlantilla,
  deletePlantilla,
  getPedidos,
  getClientes,
  getConfig,
} from '@/lib/store';
import { PlantillaWhatsApp, Pedido, Cliente } from '@/lib/types';
import { formatCurrency, formatDate, estadoPedidoLabel } from '@/lib/helpers';
import PageHeader from '@/components/PageHeader';
import Modal from '@/components/Modal';
import ActionMenu from '@/components/ActionMenu';
import EmptyState from '@/components/EmptyState';
import { inputClass, labelClass, btnPrimary, btnSecondary } from '@/lib/styles';

const VARIABLES = [
  { key: '{nombre}', desc: 'Nombre del cliente' },
  { key: '{pedido}', desc: 'Descripción del pedido' },
  { key: '{total}', desc: 'Monto total' },
  { key: '{estado}', desc: 'Estado del pedido' },
  { key: '{fecha_entrega}', desc: 'Fecha de entrega' },
  { key: '{piezas}', desc: 'Número de piezas' },
  { key: '{negocio}', desc: 'Nombre del negocio' },
  { key: '{telefono_negocio}', desc: 'Teléfono del negocio' },
];

const DEFAULT_TEMPLATES: { nombre: string; mensaje: string }[] = [
  {
    nombre: 'Confirmación de pedido',
    mensaje:
      'Hola {nombre}! Tu pedido ha sido recibido:\n\n📋 {pedido}\n📦 {piezas} piezas\n💰 Total: {total}\n\nTe avisaremos cuando esté listo. Gracias por confiar en {negocio}!',
  },
  {
    nombre: 'Pedido listo',
    mensaje:
      'Hola {nombre}! Tu pedido está LISTO para recoger:\n\n✅ {pedido}\n💰 Total: {total}\n\nPuedes pasar por él a nuestro taller o coordinamos la entrega. {negocio} — {telefono_negocio}',
  },
  {
    nombre: 'Recordatorio de pago',
    mensaje:
      'Hola {nombre}, te recordamos que tu pedido "{pedido}" tiene un saldo pendiente de {total}.\n\nPuedes pagar por transferencia o en efectivo. Cualquier duda estamos a tus órdenes. {negocio}',
  },
  {
    nombre: 'Actualización de estado',
    mensaje:
      'Hola {nombre}! Te informamos que tu pedido "{pedido}" está ahora en estado: {estado}.\n\nFecha estimada de entrega: {fecha_entrega}\n\n{negocio}',
  },
  {
    nombre: 'Seguimiento post-entrega',
    mensaje:
      'Hola {nombre}! Esperamos que estés contento/a con tu pedido de {pedido}.\n\nSi necesitas algo más, no dudes en contactarnos. ¡Gracias por tu preferencia! {negocio}',
  },
];

function replacePlaceholders(
  template: string,
  pedido: Pedido | null,
  cliente: Cliente | null,
  negocio: string,
  telefonoNeg: string,
): string {
  let msg = template;
  msg = msg.replace(/\{nombre\}/g, cliente?.nombre || 'Cliente');
  msg = msg.replace(/\{pedido\}/g, pedido?.descripcion || 'Pedido');
  msg = msg.replace(/\{total\}/g, pedido ? formatCurrency(pedido.montoTotal) : '$0');
  msg = msg.replace(/\{estado\}/g, pedido ? estadoPedidoLabel(pedido.estado) : '');
  msg = msg.replace(/\{fecha_entrega\}/g, pedido?.fechaEntrega ? formatDate(pedido.fechaEntrega) : 'Por definir');
  msg = msg.replace(/\{piezas\}/g, String(pedido?.piezas || 0));
  msg = msg.replace(/\{negocio\}/g, negocio);
  msg = msg.replace(/\{telefono_negocio\}/g, telefonoNeg);
  return msg;
}

export default function PlantillasPage() {
  const isClient = typeof window !== 'undefined';
  const [plantillas, setPlantillas] = useState<PlantillaWhatsApp[]>(() => (isClient ? getPlantillas() : []));
  const [pedidos] = useState(() =>
    isClient ? getPedidos().filter((p) => p.estado !== 'entregado' && p.estado !== 'cancelado') : [],
  );
  const [clientes] = useState(() => (isClient ? getClientes() : []));
  const [config] = useState(() => (isClient ? getConfig() : null));
  const [mounted] = useState(() => isClient);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formNombre, setFormNombre] = useState('');
  const [formMensaje, setFormMensaje] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Send modal
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTemplate, setSendTemplate] = useState<PlantillaWhatsApp | null>(null);
  const [sendPedidoId, setSendPedidoId] = useState('');
  const [preview, setPreview] = useState('');

  const reload = useCallback(() => {
    setPlantillas(getPlantillas());
  }, []);

  if (!mounted)
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
      </div>
    );

  const negocio = config?.nombreNegocio || 'Studio 24';
  const telefonoNeg = config?.telefono || '';

  const loadDefaults = () => {
    if (plantillas.length > 0 && !confirm('Ya tienes plantillas. ¿Agregar las plantillas predeterminadas?')) return;
    for (const t of DEFAULT_TEMPLATES) {
      addPlantilla({ id: uuid(), nombre: t.nombre, mensaje: t.mensaje, createdAt: new Date().toISOString() });
    }
    reload();
  };

  const openNew = () => {
    setEditingId(null);
    setFormNombre('');
    setFormMensaje('');
    setFormError(null);
    setModalOpen(true);
  };
  const openEdit = (p: PlantillaWhatsApp) => {
    setEditingId(p.id);
    setFormNombre(p.nombre);
    setFormMensaje(p.mensaje);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!formNombre.trim()) {
      setFormError('El nombre es requerido');
      return;
    }
    if (!formMensaje.trim()) {
      setFormError('El mensaje es requerido');
      return;
    }
    const data: PlantillaWhatsApp = {
      id: editingId || uuid(),
      nombre: formNombre,
      mensaje: formMensaje,
      createdAt: editingId
        ? plantillas.find((p) => p.id === editingId)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
    };
    editingId ? updatePlantilla(data) : addPlantilla(data);
    setModalOpen(false);
    reload();
  };

  const handleDelete = (id: string) => {
    if (confirm('¿Eliminar esta plantilla?')) {
      deletePlantilla(id);
      reload();
    }
  };

  const openSend = (template: PlantillaWhatsApp) => {
    setSendTemplate(template);
    setSendPedidoId('');
    setPreview(replacePlaceholders(template.mensaje, null, null, negocio, telefonoNeg));
    setSendOpen(true);
  };

  const updatePreview = (pedidoId: string) => {
    setSendPedidoId(pedidoId);
    const ped = pedidos.find((p) => p.id === pedidoId) || null;
    const cli = ped ? clientes.find((c) => c.id === ped.clienteId) || null : null;
    if (sendTemplate) {
      setPreview(replacePlaceholders(sendTemplate.mensaje, ped, cli, negocio, telefonoNeg));
    }
  };

  const enviarWhatsApp = () => {
    const ped = pedidos.find((p) => p.id === sendPedidoId) || null;
    const cli = ped ? clientes.find((c) => c.id === ped.clienteId) || null : null;
    const tel = cli?.telefono?.replace(/\D/g, '') || '';
    const url = tel
      ? `https://wa.me/52${tel}?text=${encodeURIComponent(preview)}`
      : `https://wa.me/?text=${encodeURIComponent(preview)}`;
    window.open(url, '_blank');
    setSendOpen(false);
  };

  const insertVar = (varKey: string) => {
    setFormMensaje((prev) => prev + varKey);
  };

  return (
    <div>
      <PageHeader
        title="Plantillas de WhatsApp"
        description={`${plantillas.length} plantillas`}
        action={
          <div className="flex gap-2">
            {plantillas.length === 0 && (
              <button
                onClick={loadDefaults}
                className="px-4 py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase border border-neutral-200 text-neutral-500 hover:border-[#c72a09] hover:text-[#c72a09] transition-colors"
              >
                Cargar predeterminadas
              </button>
            )}
            <button onClick={openNew} className={btnPrimary}>
              + Nueva Plantilla
            </button>
          </div>
        }
      />

      {/* Templates */}
      {plantillas.length === 0 ? (
        <EmptyState
          title="Sin plantillas"
          description="Crea plantillas de mensajes para enviar rápido por WhatsApp"
          action={
            <button
              onClick={loadDefaults}
              className="text-[#c72a09] font-bold text-xs uppercase tracking-wide hover:underline"
            >
              Cargar plantillas predeterminadas
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plantillas.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl border border-neutral-100 p-5 relative group">
              <div className="absolute top-3 right-3">
                <ActionMenu
                  items={[
                    { label: 'Editar', onClick: () => openEdit(p) },
                    { label: 'Eliminar', onClick: () => handleDelete(p.id), danger: true },
                  ]}
                />
              </div>
              <h3 className="font-bold text-[#0a0a0a] mb-2 pr-8">{p.nombre}</h3>
              <p className="text-xs text-neutral-400 whitespace-pre-line line-clamp-4">{p.mensaje}</p>
              <button
                onClick={() => openSend(p)}
                className="mt-4 w-full bg-[#25D366] text-white py-2.5 rounded-xl text-[10px] font-bold tracking-[0.05em] uppercase hover:bg-[#20bd5a] transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Enviar
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar Plantilla' : 'Nueva Plantilla'}
      >
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Nombre *</label>
            <input
              type="text"
              value={formNombre}
              onChange={(e) => setFormNombre(e.target.value)}
              placeholder="Ej: Confirmación de pedido"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Mensaje *</label>
            <textarea
              value={formMensaje}
              onChange={(e) => setFormMensaje(e.target.value)}
              rows={6}
              placeholder="Escribe el mensaje. Usa las variables de abajo para personalizar."
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Variables disponibles</label>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVar(v.key)}
                  className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-neutral-100 text-neutral-600 hover:bg-[#c72a09]/10 hover:text-[#c72a09] transition-colors"
                  title={v.desc}
                >
                  {v.key}
                </button>
              ))}
            </div>
          </div>
          {formError && (
            <p className="text-xs text-red-500 font-semibold bg-red-50 rounded-xl px-3.5 py-2.5">{formError}</p>
          )}
          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
            <button onClick={() => setModalOpen(false)} className={btnSecondary}>
              Cancelar
            </button>
            <button onClick={handleSave} className={btnPrimary}>
              {editingId ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Send Modal */}
      <Modal open={sendOpen} onClose={() => setSendOpen(false)} title={`Enviar: ${sendTemplate?.nombre || ''}`}>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Seleccionar pedido (opcional)</label>
            <select value={sendPedidoId} onChange={(e) => updatePreview(e.target.value)} className={inputClass}>
              <option value="">Sin pedido específico</option>
              {pedidos.map((p) => {
                const cli = clientes.find((c) => c.id === p.clienteId);
                return (
                  <option key={p.id} value={p.id}>
                    {p.descripcion} — {cli?.nombre || 'Sin cliente'}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className={labelClass}>Vista previa</label>
            <div className="bg-[#e5ddd5] rounded-xl p-4">
              <div className="bg-[#dcf8c6] rounded-xl p-3 max-w-[80%] ml-auto">
                <p className="text-sm whitespace-pre-line">{preview}</p>
              </div>
            </div>
          </div>
          <button
            onClick={enviarWhatsApp}
            className="w-full bg-[#25D366] text-white py-3 rounded-xl text-xs font-bold tracking-[0.05em] uppercase hover:bg-[#20bd5a] transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Abrir WhatsApp
          </button>
        </div>
      </Modal>
    </div>
  );
}
