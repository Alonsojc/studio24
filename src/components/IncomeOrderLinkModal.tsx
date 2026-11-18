'use client';

import { useEffect, useRef, useState } from 'react';
import { Link2, Unlink2 } from 'lucide-react';
import { incomeOrderChoices, loadCustomerAccount, type CustomerAccount } from '@/lib/customer-accounts';
import { formatCurrency, formatDate, formaPagoLabel } from '@/lib/helpers';
import { linkOrderIncome } from '@/lib/sales-cloud';
import { btnPrimary, btnSecondary, inputClass, labelClass } from '@/lib/styles';
import type { Ingreso } from '@/lib/types';
import Modal from './Modal';

export default function IncomeOrderLinkModal({
  income,
  onClose,
  onSaved,
}: {
  income: Ingreso;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [orderId, setOrderId] = useState('');
  const [mode, setMode] = useState<'apply' | 'counted' | ''>('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const unlink = income.pedidoVinculo === 'existente' && Boolean(income.pedidoId);
  useEffect(() => {
    let active = true;
    loadCustomerAccount(income.clienteId)
      .then((next) => {
        if (active) setAccount(next);
      })
      .catch((error: Error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [income.clienteId, attempt]);

  const current = account?.ingresos.find((row) => row.id === income.id);
  const choices = !unlink && account && current ? incomeOrderChoices(account, current) : [];
  const selected = choices.find((choice) => choice.order.id === orderId);
  const action =
    selected?.apply && selected?.counted ? mode : selected?.apply ? 'apply' : selected?.counted ? 'counted' : '';
  const linkedOrder = account?.pedidos.find((order) => order.id === current?.pedidoId);
  const visible = current || income;
  const save = async () => {
    const order = unlink ? null : selected?.order;
    if (inFlight.current || !current || (!unlink && (!order || !action))) return;
    inFlight.current = true;
    setSaving(true);
    setError('');
    try {
      await linkOrderIncome(current, order || null, action === 'counted');
      onSaved(unlink ? 'Vínculo retirado. El ingreso se conservó.' : 'Ingreso vinculado. No se registró otro cobro.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo confirmar el vínculo.');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !inFlight.current && onClose()}
      title={unlink ? 'Desvincular ingreso' : 'Vincular a un pedido'}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-100 pb-3">
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold">{visible.descripcion}</p>
            <p className="text-xs text-neutral-500">
              {formatDate(visible.fecha)} · {formaPagoLabel(visible.formaPago)}
            </p>
          </div>
          <p className="text-sm font-bold tabular-nums">{formatCurrency(visible.montoTotal)}</p>
        </div>
        {!account && !error && (
          <p role="status" className="text-sm text-neutral-500">
            Consultando la cuenta…
          </p>
        )}
        {account && !current && <p className="text-sm text-neutral-500">El ingreso no está confirmado en la nube.</p>}
        {current && unlink && (
          <p className="break-words text-sm text-neutral-600">
            {linkedOrder ? `Pedido: ${linkedOrder.descripcion}. ` : ''}
            El ingreso se conserva. Si se aplicó al saldo pendiente, se restablece ese saldo.
          </p>
        )}
        {current &&
          !unlink &&
          (choices.length ? (
            <>
              <label className="block">
                <span className={labelClass}>Pedido de {account?.cliente?.nombre || 'la misma clienta'}</span>
                <select
                  className={inputClass}
                  value={orderId}
                  onChange={(event) => {
                    setOrderId(event.target.value);
                    setMode('');
                  }}
                  disabled={saving}
                >
                  <option value="">Seleccionar pedido</option>
                  {choices.map(({ order, pending }) => (
                    <option key={order.id} value={order.id}>
                      {order.descripcion} · {formatDate(order.fechaPedido)} · {formatCurrency(pending)} pendiente
                    </option>
                  ))}
                </select>
              </label>
              {selected?.apply && selected.counted && (
                <fieldset className="space-y-1">
                  <legend className={labelClass}>¿El cobro ya está anotado en el pedido?</legend>
                  <label className="flex min-h-10 items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="link-mode"
                      checked={mode === 'apply'}
                      onChange={() => setMode('apply')}
                      disabled={saving}
                    />
                    No, aplicar al saldo pendiente
                  </label>
                  <label className="flex min-h-10 items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="link-mode"
                      checked={mode === 'counted'}
                      onChange={() => setMode('counted')}
                      disabled={saving}
                    />
                    Sí, ya está incluido en lo pagado
                  </label>
                </fieldset>
              )}
              {selected && action && (
                <p className="break-words text-sm text-neutral-600">
                  {action === 'counted' ? 'No cambia el saldo del pedido. ' : ''}
                  Saldo pendiente:{' '}
                  <strong>
                    {formatCurrency(
                      action === 'apply'
                        ? Math.round((selected.pending - current.montoTotal) * 100) / 100
                        : selected.pending,
                    )}
                  </strong>
                  .
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-neutral-500">
              {current.pedidoId
                ? 'El ingreso ya tiene un pedido vinculado.'
                : 'No hay pedidos elegibles para este importe. Revisa el saldo y que el ingreso no esté aplicado como adelanto.'}
            </p>
          ))}
        {error && (
          <div>
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
            <button
              className={btnSecondary}
              onClick={() => {
                setError('');
                setAttempt(attempt + 1);
              }}
              disabled={saving}
            >
              Actualizar cuenta
            </button>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button className={btnSecondary} onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            className={`${btnPrimary} inline-flex min-h-10 items-center gap-2 disabled:opacity-50`}
            onClick={save}
            disabled={saving || !current || (unlink ? !current.pedidoId : !selected || !action)}
          >
            {unlink ? <Unlink2 size={15} aria-hidden /> : <Link2 size={15} aria-hidden />}
            {saving ? 'Confirmando…' : unlink ? 'Desvincular' : 'Vincular ingreso'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
