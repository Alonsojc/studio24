'use client';

import { useRef, useState } from 'react';
import { unrecordedOrderPayments, splitIncludedIVA } from '@/lib/business-rules';
import { formatCurrency, formatDate, formaPagoLabel, todayString } from '@/lib/helpers';
import { registerOrderIncome } from '@/lib/sales-cloud';
import { btnPrimary, btnSecondary, inputClass, labelClass } from '@/lib/styles';
import type { FormaPago, Pedido } from '@/lib/types';
import Modal from './Modal';

const methods: FormaPago[] = ['efectivo', 'tarjeta', 'transferencia', 'otro'];

export default function OrderIncomeModal({
  order,
  onClose,
  onSaved,
}: {
  order: Pedido;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [ivaIncluded, setIvaIncluded] = useState(false);
  const [date, setDate] = useState('');
  const [method, setMethod] = useState<FormaPago | ''>('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const payments = unrecordedOrderPayments(order);
  const needsDetails = payments.some((payment) => payment.needsDetails);
  const canSubmit =
    confirmed && payments.length > 0 && (!needsDetails || Boolean(date && date <= todayString() && method));
  const save = async () => {
    if (!canSubmit || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await registerOrderIncome(order, ivaIncluded, date, method);
      onSaved(
        result.created
          ? result.rows.length === 1
            ? 'Ingreso registrado.'
            : `${result.rows.length} ingresos registrados.`
          : 'Ya hay ingresos vinculados a este pedido. No se registró otro cobro.',
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo confirmar el ingreso.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={() => !inFlight.current && onClose()} title="Registrar ingresos de cobros previos">
      <div className="space-y-4">
        <p className="break-words text-sm font-semibold">{order.descripcion}</p>
        <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
          {payments.map((payment) => (
            <li key={payment.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
              <span className="text-neutral-600">
                {payment.needsDetails
                  ? 'Cobro previo sin detalle'
                  : `${formatDate(payment.fecha)} · ${formaPagoLabel(payment.formaPago)}`}
              </span>
              <span className="font-semibold tabular-nums">{formatCurrency(payment.monto)}</span>
            </li>
          ))}
        </ul>
        {needsDetails && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              <span className={labelClass}>Fecha real del cobro previo</span>
              <input
                type="date"
                max={todayString()}
                className={inputClass}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              <span className={labelClass}>Forma real de pago</span>
              <select
                className={inputClass}
                value={method}
                onChange={(e) => setMethod(e.target.value as FormaPago | '')}
                disabled={busy}
              >
                <option value="">Seleccionar</option>
                {methods.map((item) => (
                  <option key={item} value={item}>
                    {formaPagoLabel(item)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ivaIncluded}
            onChange={(e) => setIvaIncluded(e.target.checked)}
            disabled={busy}
          />
          Desglosar el IVA del 16% ya incluido
        </label>
        {ivaIncluded && (
          <p className="text-sm text-neutral-600">
            IVA incluido:{' '}
            <strong>
              {formatCurrency(payments.reduce((sum, payment) => sum + splitIncludedIVA(payment.monto).iva, 0))}
            </strong>
            . El total cobrado no cambia y no se emite un CFDI.
          </p>
        )}
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={busy} />
          Confirmo que estos cobros no están registrados en Ingresos.
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button className={btnSecondary} onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className={`${btnPrimary} disabled:opacity-50`} onClick={save} disabled={!canSubmit || busy}>
            {busy ? 'Confirmando…' : payments.length > 1 ? 'Registrar ingresos' : 'Registrar ingreso'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
