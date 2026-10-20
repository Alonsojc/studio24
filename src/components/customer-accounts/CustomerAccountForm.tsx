'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import {
  advanceBalance,
  availableIncomes,
  customerAccountToday,
  pendingOrderAmount,
  type CustomerAccount,
  type CustomerCommand,
  type CustomerMovement,
} from '@/lib/customer-accounts';
import { advanceFolio } from '@/lib/customer-account-export';
import { formaPagoLabel, formatCurrency } from '@/lib/helpers';
import { btnPrimary, btnSecondary, inputClass, labelClass } from '@/lib/styles';
import type { FormaPago } from '@/lib/types';

export interface AccountEditor {
  action: CustomerCommand['action'];
  advanceId?: string;
  pedidoId?: string;
  movement?: CustomerMovement;
}
interface Props {
  editor: AccountEditor;
  account: CustomerAccount;
  clienteId: string;
  busy: boolean;
  error: string;
  pendingCommand?: CustomerCommand;
  onRetry: (command: CustomerCommand) => Promise<boolean>;
  onClose: () => void;
  onSubmit: (action: CustomerCommand['action'], data: CustomerCommand['data'], receipt?: File) => Promise<boolean>;
}
export default function CustomerAccountForm({
  editor,
  account,
  clienteId,
  busy,
  error,
  pendingCommand,
  onRetry,
  onClose,
  onSubmit,
}: Props) {
  const [receipt, setReceipt] = useState<File>();
  const [source, setSource] = useState<'new' | 'existing'>('new');
  const [incomeId, setIncomeId] = useState('');
  const [amount, setAmount] = useState('');
  const [fecha, setFecha] = useState(customerAccountToday());
  const [formaPago, setFormaPago] = useState<FormaPago>('transferencia');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [advanceId, setAdvanceId] = useState(
    editor.advanceId ||
      account.advances.find((advance) => !advance.voidedAt && advanceBalance(advance.id, account.movements) > 0)?.id ||
      '',
  );
  const [orderId, setOrderId] = useState(editor.pedidoId || '');
  const titles = {
    receive: 'Registrar adelanto',
    apply: 'Aplicar saldo a pedido',
    reverse_application: 'Revertir aplicacion',
    cancel: 'Anular registro de adelanto',
  };
  const invoices = availableIncomes(account);
  const advance = account.advances.find(
    (row) => row.id === (editor.action === 'cancel' ? editor.advanceId : advanceId),
  );
  const order = account.pedidos.find((row) => row.id === orderId);
  const maximum = Math.min(
    advance ? advanceBalance(advance.id, account.movements) : 0,
    order ? pendingOrderAmount(order) : Infinity,
  );
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (pendingCommand) {
      if (await onRetry(pendingCommand)) onClose();
      return;
    }
    const data: CustomerCommand['data'] = { clienteId, fecha, referencia: reference.trim(), notas: notes.trim() };
    if (editor.action === 'receive') {
      data.source = source;
      if (source === 'existing') data.ingresoId = incomeId;
      else {
        data.amount = Number(amount);
        data.formaPago = formaPago;
      }
    } else if (editor.action === 'apply') {
      data.advanceId = advanceId;
      data.pedidoId = orderId;
      data.amount = Number(amount);
    } else if (editor.action === 'reverse_application') data.movementId = editor.movement?.id;
    else data.advanceId = editor.advanceId;
    if (await onSubmit(editor.action, data, receipt)) onClose();
  };
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={titles[editor.action]}
      dirty={!pendingCommand && Boolean(amount || reference || notes || receipt)}
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <fieldset disabled={busy || Boolean(pendingCommand)} className="space-y-4">
          {editor.action === 'receive' && (
            <>
              <div className="flex border-b border-neutral-200" aria-label="Origen del adelanto">
                {(['new', 'existing'] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    disabled={busy}
                    aria-pressed={source === value}
                    onClick={() => setSource(value)}
                    className={`flex-1 border-b-2 px-3 py-3 text-sm font-semibold ${source === value ? 'border-[#c72a09] text-[#c72a09]' : 'border-transparent text-neutral-500'}`}
                  >
                    {value === 'new' ? 'Nuevo cobro' : 'Ingreso existente'}
                  </button>
                ))}
              </div>
              {source === 'existing' && (
                <div>
                  <label htmlFor="account-income" className={labelClass}>
                    Ingreso registrado
                  </label>
                  <select
                    id="account-income"
                    className={inputClass}
                    value={incomeId}
                    onChange={(event) => setIncomeId(event.target.value)}
                    required
                    disabled={busy}
                  >
                    <option value="">Seleccionar ingreso</option>
                    {invoices.map((income) => (
                      <option key={income.id} value={income.id}>
                        {income.fecha} · {income.descripcion} · {formatCurrency(income.montoTotal)}
                      </option>
                    ))}
                  </select>
                  {!invoices.length && (
                    <p className="mt-2 text-sm text-neutral-500">
                      Sin ingresos disponibles de esta clienta sin pedido vinculado.
                    </p>
                  )}
                  {incomeId && (
                    <p className="mt-2 text-sm font-semibold">
                      Adelanto: {formatCurrency(invoices.find((income) => income.id === incomeId)?.montoTotal || 0)}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
          {editor.action === 'apply' && (
            <>
              <div>
                <label htmlFor="account-advance" className={labelClass}>
                  Adelanto
                </label>
                <select
                  id="account-advance"
                  className={inputClass}
                  value={advanceId}
                  onChange={(event) => setAdvanceId(event.target.value)}
                  required
                  disabled={busy}
                >
                  <option value="">Seleccionar adelanto</option>
                  {account.advances
                    .filter((row) => !row.voidedAt && advanceBalance(row.id, account.movements) > 0)
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {advanceFolio(row.id, row.folio)} · {row.referencia || row.fecha} ·{' '}
                        {formatCurrency(advanceBalance(row.id, account.movements))}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label htmlFor="account-order" className={labelClass}>
                  Pedido
                </label>
                <select
                  id="account-order"
                  className={inputClass}
                  value={orderId}
                  onChange={(event) => setOrderId(event.target.value)}
                  required
                  disabled={busy}
                >
                  <option value="">Seleccionar pedido</option>
                  {account.pedidos
                    .filter((row) => pendingOrderAmount(row) > 0)
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.descripcion} · Pendiente {formatCurrency(pendingOrderAmount(row))}
                      </option>
                    ))}
                </select>
              </div>
            </>
          )}
          {editor.action === 'reverse_application' && (
            <div className="border-l-2 border-amber-500 pl-3 text-sm">
              <p className="font-semibold">{editor.movement?.pedidoDescripcion}</p>
              <p>
                {formatCurrency(editor.movement?.amount || 0)} regresaran al adelanto. El pedido volvera a tener ese
                importe pendiente.
              </p>
            </div>
          )}
          {editor.action === 'cancel' && (
            <div className="border-l-2 border-red-600 pl-3 text-sm">
              <p className="font-semibold">
                {advance && advanceFolio(advance.id, advance.folio)} · {formatCurrency(advance?.amount || 0)}
              </p>
              <p>
                {advance?.source === 'existing'
                  ? 'Se desvinculara el adelanto. El ingreso original permanecera sin cambios.'
                  : 'El ingreso creado con este adelanto quedara en $0.00. El historial se conservara.'}
              </p>
            </div>
          )}
          {(editor.action === 'apply' || (editor.action === 'receive' && source === 'new')) && (
            <div>
              <label htmlFor="account-amount" className={labelClass}>
                Importe (MXN)
              </label>
              <input
                id="account-amount"
                className={inputClass}
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                max={editor.action === 'apply' ? maximum : 999999999999.99}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
                disabled={busy}
              />
              {editor.action === 'apply' && (
                <p className="mt-2 text-sm text-neutral-500">
                  Maximo aplicable: {formatCurrency(Number.isFinite(maximum) ? maximum : 0)}
                </p>
              )}
            </div>
          )}
          {!(editor.action === 'receive' && source === 'existing') && (
            <div>
              <label htmlFor="account-date" className={labelClass}>
                Fecha
              </label>
              <input
                id="account-date"
                className={inputClass}
                type="date"
                value={fecha}
                max={customerAccountToday()}
                onChange={(event) => setFecha(event.target.value)}
                required
                disabled={busy}
              />
            </div>
          )}
          {editor.action === 'receive' && source === 'new' && (
            <div>
              <label htmlFor="account-method" className={labelClass}>
                Forma de pago
              </label>
              <select
                id="account-method"
                className={inputClass}
                value={formaPago}
                onChange={(event) => setFormaPago(event.target.value as FormaPago)}
                disabled={busy}
              >
                {(['transferencia', 'efectivo', 'tarjeta', 'otro'] as const).map((method) => (
                  <option key={method} value={method}>
                    {formaPagoLabel(method)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {['receive', 'apply'].includes(editor.action) && (
            <div>
              <label htmlFor="account-reference" className={labelClass}>
                Referencia
              </label>
              <input
                id="account-reference"
                className={inputClass}
                maxLength={200}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                disabled={busy}
              />
            </div>
          )}
          <div>
            <label htmlFor="account-notes" className={labelClass}>
              {['cancel', 'reverse_application'].includes(editor.action) ? 'Motivo de la correccion' : 'Notas'}
            </label>
            <textarea
              id="account-notes"
              className={inputClass}
              rows={3}
              maxLength={2000}
              required={['cancel', 'reverse_application'].includes(editor.action)}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={busy}
            />
          </div>
          {editor.action === 'receive' && (
            <div>
              <label htmlFor="account-receipt" className={labelClass}>
                Comprobante opcional (PDF, JPG o PNG, maximo 10 MB)
              </label>
              <input
                id="account-receipt"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className={`${inputClass} text-xs`}
                onChange={(event) => setReceipt(event.target.files?.[0])}
              />
            </div>
          )}
          {editor.action === 'receive' && source === 'new' && (
            <label className="flex gap-3 text-sm text-neutral-600">
              <input type="checkbox" required disabled={busy} className="mt-1 h-4 w-4 shrink-0 accent-[#c72a09]" />
              Confirmo que este cobro aun no esta registrado en Ingresos ni en los pagos de un pedido.
            </label>
          )}
          {editor.action === 'cancel' && (
            <label className="flex gap-3 text-sm text-neutral-600">
              <input type="checkbox" required disabled={busy} className="mt-1 h-4 w-4 shrink-0 accent-[#c72a09]" />
              Es una correccion de captura, no una devolucion de dinero.
            </label>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
          <button type="button" className={btnSecondary} disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={`${btnPrimary} disabled:opacity-50`} disabled={busy}>
            {busy ? 'Confirmando...' : pendingCommand ? 'Reintentar confirmacion' : 'Confirmar movimiento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
