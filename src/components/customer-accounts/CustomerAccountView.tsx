'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  FileDown,
  Paperclip,
  Plus,
  RefreshCw,
  Sheet,
  Undo2,
  XCircle,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { useRole } from '@/components/RoleProvider';
import { getConfig } from '@/lib/store';
import {
  advanceBalance,
  accountBalance,
  buildCustomerStatement,
  customerAccountToday,
  movementLabel,
  pendingOrderAmount,
} from '@/lib/customer-accounts';
import { accountFileName, advanceFolio } from '@/lib/customer-account-export';
import { useCustomerAccount } from '@/lib/useCustomerAccount';
import { formatCurrency, formatDate, formaPagoLabel } from '@/lib/helpers';
import { btnPrimary, inputClass, labelClass } from '@/lib/styles';
import CustomerAccountForm, { type AccountEditor } from './CustomerAccountForm';
import { openCustomerReceipt } from '@/lib/customer-receipts';
import CustomerIncomeHistory from './CustomerIncomeHistory';

const iconButton =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 disabled:opacity-40';
const commandButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40';
const cell = 'px-4 py-3 text-sm align-top';

export default function CustomerAccountView({
  clienteId,
  pedidoId = '',
  initialAction,
}: {
  clienteId: string;
  pedidoId?: string;
  initialAction?: 'receive' | 'collect';
}) {
  const { role } = useRole();
  const state = useCustomerAccount(clienteId);
  const { account, confirmed, refreshing, busy, error, pending } = state;
  const canManageAccount = role === 'admin' || role === 'contador';
  const [tab, setTab] = useState<'incomes' | 'advances' | 'movements' | 'orders'>(
    initialAction === 'receive' ? 'advances' : pedidoId ? 'orders' : 'incomes',
  );
  const [editor, setEditor] = useState<AccountEditor | null>(() =>
    initialAction && canManageAccount && !pending.length ? { action: initialAction, pedidoId } : null,
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const validRange = !from || !to || from <= to;
  const statement = validRange ? buildCustomerStatement(account, from, to) : null;
  const available = accountBalance(account.movements);
  const totalIncome = account.ingresos.reduce((sum, income) => sum + Math.round(income.montoTotal * 100), 0) / 100;
  const reverseIds = new Set(account.movements.map((movement) => movement.reversesId).filter(Boolean));
  const canMove = confirmed && !busy && !pending.length && canManageAccount;
  const openEditor = (next: AccountEditor) => {
    setExportError('');
    setEditor(next);
  };
  const exportFile = async (type: 'pdf' | 'xlsx') => {
    if (!confirmed || !account.cliente || !statement) return;
    setExporting(true);
    setExportError('');
    try {
      const helpers = await import('@/lib/customer-account-export');
      const input = { cliente: account.cliente, business: getConfig(), account, statement };
      if (type === 'pdf') (await helpers.createCustomerAccountPdf(input)).save(accountFileName(account.cliente, 'pdf'));
      else
        helpers.downloadAccountFile(
          await helpers.createCustomerAccountExcel(input),
          accountFileName(account.cliente, 'xlsx'),
        );
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'No se pudo generar el estado de cuenta');
    } finally {
      setExporting(false);
    }
  };
  if (!clienteId)
    return (
      <div>
        <PageHeader title="Cuenta de cliente" description="" />
        <Link href="/clientes" className={commandButton}>
          <ArrowLeft size={16} />
          Seleccionar cliente
        </Link>
      </div>
    );
  return (
    <div className="min-w-0">
      <Link
        href="/clientes"
        className="mb-5 inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900"
      >
        <ArrowLeft size={16} />
        Clientes
      </Link>
      <PageHeader
        title={account.cliente?.nombre || 'Cuenta de cliente'}
        description="Cuenta y movimientos"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={iconButton}
              title="Actualizar cuenta"
              aria-label="Actualizar cuenta"
              onClick={() => void state.refresh()}
              disabled={busy || refreshing}
            >
              <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              className={commandButton}
              title="Descargar estado de cuenta PDF"
              onClick={() => void exportFile('pdf')}
              disabled={!confirmed || exporting || !validRange || busy}
            >
              <FileDown size={17} />
              PDF
            </button>
            <button
              className={commandButton}
              title="Descargar estado de cuenta Excel"
              onClick={() => void exportFile('xlsx')}
              disabled={!confirmed || exporting || !validRange || busy}
            >
              <Sheet size={17} />
              Excel
            </button>
          </div>
        }
      />
      {error && !editor && (
        <div role="alert" className="mb-5 border-l-2 border-red-600 py-2 pl-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {exportError && (
        <p role="alert" className="mb-5 text-sm text-red-700">
          {exportError}
        </p>
      )}
      {!confirmed && (
        <p role="status" className="mb-4 text-xs text-neutral-500">
          {refreshing
            ? 'Consultando saldo confirmado en nube...'
            : 'Vista sin confirmar. Actualiza la cuenta antes de registrar o exportar movimientos.'}
        </p>
      )}
      {pending.length > 0 && (
        <div role="alert" className="mb-6 border-l-2 border-amber-500 pl-3 text-sm text-amber-900">
          <p className="font-semibold">Hay {pending.length} movimiento(s) sin confirmacion.</p>
          <p>El reintento conserva la misma operacion para evitar duplicar dinero.</p>
          {pending.map((command) => (
            <button
              key={command.id}
              disabled={busy}
              className={`${commandButton} mt-3`}
              onClick={() => void state.retry(command)}
            >
              <RefreshCw size={15} />
              Reintentar {command.action === 'receive' ? 'adelanto' : 'movimiento'}
            </button>
          ))}
        </div>
      )}
      <dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-neutral-200 py-5 lg:grid-cols-5">
        <div>
          <dt className={labelClass}>Total ingresado</dt>
          <dd className="break-words text-2xl font-bold text-green-600">{formatCurrency(totalIncome)}</dd>
        </div>
        <div>
          <dt className={labelClass}>Saldo a favor disponible</dt>
          <dd className="break-words text-2xl font-bold text-emerald-600">{formatCurrency(available)}</dd>
        </div>
        <div>
          <dt className={labelClass}>Adelantos vigentes</dt>
          <dd className="break-words text-xl font-semibold text-neutral-800">
            {formatCurrency(
              account.advances.filter((advance) => !advance.voidedAt).reduce((sum, advance) => sum + advance.amount, 0),
            )}
          </dd>
        </div>
        <div>
          <dt className={labelClass}>Aplicado a pedidos</dt>
          <dd className="break-words text-xl font-semibold text-neutral-800">
            {formatCurrency(
              account.movements.reduce(
                (sum, row) =>
                  sum +
                  (row.kind === 'apply'
                    ? Math.round(row.amount * 100)
                    : row.kind === 'reverse_application'
                      ? -Math.round(row.amount * 100)
                      : 0),
                0,
              ) / 100,
            )}
          </dd>
        </div>
        <div>
          <dt className={labelClass}>Pendiente de pedidos</dt>
          <dd className="break-words text-xl font-semibold text-red-600">
            {formatCurrency(
              account.pedidos.reduce((sum, pedido) => sum + Math.round(pendingOrderAmount(pedido) * 100), 0) / 100,
            )}
          </dd>
        </div>
      </dl>
      <div className="mb-6 flex flex-wrap justify-between gap-3">
        <div role="tablist" aria-label="Cuenta de cliente" className="flex flex-wrap border-b border-neutral-200">
          {(
            [
              ['incomes', 'Ingresos'],
              ['advances', 'Adelantos'],
              ['movements', 'Movimientos de saldo'],
              ['orders', 'Pedidos'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`min-h-11 border-b-2 px-4 py-2 text-sm font-semibold ${tab === value ? 'border-[#c72a09] text-[#c72a09]' : 'border-transparent text-neutral-500'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => openEditor({ action: 'receive' })}
            disabled={!canMove}
            className={`${btnPrimary} inline-flex min-h-11 items-center gap-2 disabled:opacity-40`}
          >
            <Plus size={16} />
            Registrar adelanto
          </button>
          <button
            onClick={() => openEditor({ action: 'apply', pedidoId })}
            disabled={!canMove || available <= 0 || !account.pedidos.some((pedido) => pendingOrderAmount(pedido) > 0)}
            className={commandButton}
          >
            <ArrowRightLeft size={16} />
            Aplicar saldo
          </button>
        </div>
      </div>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="statement-from" className={labelClass}>
            Desde
          </label>
          <input
            id="statement-from"
            type="date"
            className={`${inputClass} max-w-48`}
            value={from}
            max={to || customerAccountToday()}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="statement-to" className={labelClass}>
            Hasta
          </label>
          <input
            id="statement-to"
            type="date"
            className={`${inputClass} max-w-48`}
            value={to}
            min={from}
            max={customerAccountToday()}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
        {(from || to) && (
          <button
            className={iconButton}
            aria-label="Quitar filtro de fechas"
            title="Quitar filtro de fechas"
            onClick={() => {
              setFrom('');
              setTo('');
            }}
          >
            <XCircle size={17} />
          </button>
        )}
        {statement && (
          <p className="w-full text-xs text-neutral-500 sm:ml-auto sm:w-auto">
            {tab === 'incomes' ? (
              <>
                {statement.incomes.length} {statement.incomes.length === 1 ? 'ingreso' : 'ingresos'} en el periodo
              </>
            ) : (
              <>
                Saldo a favor inicial <strong>{formatCurrency(statement.opening)}</strong> · Saldo al cierre{' '}
                <strong>{formatCurrency(statement.closing)}</strong>
              </>
            )}
          </p>
        )}
        {!validRange && (
          <p role="alert" className="w-full text-sm text-red-700">
            La fecha inicial debe ser anterior a la final.
          </p>
        )}
      </div>

      {tab === 'incomes' && <CustomerIncomeHistory statement={statement} />}
      {tab === 'advances' && (
        <div role="tabpanel" aria-label="Adelantos" className="overflow-x-auto border-y border-neutral-200">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-neutral-50 text-[10px] uppercase text-neutral-500">
              <tr>
                {['Adelanto', 'Fecha y referencia', 'Recibido', 'Aplicado', 'Disponible', ''].map((label, index) => (
                  <th key={index} className="px-4 py-3 font-semibold">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...account.advances].reverse().map((advance) => {
                const entries = account.movements.filter((row) => row.advanceId === advance.id);
                const applications = entries.filter((row) => row.kind === 'apply');
                const applied =
                  applications
                    .filter((row) => !reverseIds.has(row.id))
                    .reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100;
                const remaining = advanceBalance(advance.id, account.movements);
                return (
                  <Fragment key={advance.id}>
                    <tr className="border-t border-neutral-100">
                      <td className={cell}>
                        <button
                          aria-expanded={expanded === advance.id}
                          onClick={() => setExpanded(expanded === advance.id ? null : advance.id)}
                          className="flex min-h-11 items-center gap-2 font-semibold text-neutral-800"
                        >
                          {expanded === advance.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          {advanceFolio(advance.id, advance.folio)}
                        </button>
                        {advance.voidedAt && <span className="text-xs text-red-600">Anulado</span>}
                      </td>
                      <td className={`${cell} max-w-72 break-words`}>
                        {formatDate(advance.fecha)}
                        <p className="text-xs text-neutral-500">
                          {advance.referencia || formaPagoLabel(advance.formaPago)}
                        </p>
                        <p className="text-xs text-neutral-400">
                          {advance.source === 'existing' ? 'Ingreso vinculado' : 'Nuevo cobro'}
                        </p>
                      </td>
                      <td className={`${cell} whitespace-nowrap`}>{formatCurrency(advance.amount)}</td>
                      <td className={`${cell} whitespace-nowrap`}>{formatCurrency(applied)}</td>
                      <td className={`${cell} whitespace-nowrap font-semibold text-emerald-700`}>
                        {formatCurrency(remaining)}
                      </td>
                      <td className={cell}>
                        <div className="flex gap-2">
                          {advance.receiptPath && (
                            <button
                              className={iconButton}
                              title="Ver comprobante"
                              aria-label={`Ver comprobante ${advanceFolio(advance.id, advance.folio)}`}
                              onClick={() =>
                                void openCustomerReceipt(advance.receiptPath!).catch((error) =>
                                  setExportError(
                                    error instanceof Error ? error.message : 'No se pudo abrir el comprobante',
                                  ),
                                )
                              }
                            >
                              <Paperclip size={16} />
                            </button>
                          )}
                          {remaining > 0 && (
                            <button
                              className={iconButton}
                              title="Aplicar este adelanto"
                              aria-label={`Aplicar ${advanceFolio(advance.id, advance.folio)}`}
                              disabled={!canMove}
                              onClick={() => openEditor({ action: 'apply', advanceId: advance.id, pedidoId })}
                            >
                              <ArrowRightLeft size={16} />
                            </button>
                          )}
                          {role === 'admin' && !advance.voidedAt && remaining === advance.amount && (
                            <button
                              className={iconButton}
                              title="Anular registro de adelanto"
                              aria-label={`Anular ${advanceFolio(advance.id, advance.folio)}`}
                              disabled={!canMove}
                              onClick={() => openEditor({ action: 'cancel', advanceId: advance.id })}
                            >
                              <XCircle size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded === advance.id && (
                      <tr>
                        <td colSpan={6} className="border-t border-neutral-100 bg-neutral-50 px-6 py-4">
                          <p className="mb-2 text-xs text-neutral-500">Ingreso: {advance.ingresoId}</p>
                          {advance.notas && <p className="mb-2 break-words text-sm">{advance.notas}</p>}
                          {!applications.length && (
                            <p className="text-sm text-neutral-500">Sin aplicaciones a pedidos.</p>
                          )}
                          {applications.map((movement) => (
                            <div
                              key={movement.id}
                              className="flex items-center justify-between gap-3 border-b border-neutral-200 py-3 text-sm"
                            >
                              <div>
                                <p className="font-semibold">{movement.pedidoDescripcion}</p>
                                <p className="text-xs text-neutral-500">
                                  {formatDate(movement.fecha)}
                                  {reverseIds.has(movement.id) ? ' · Aplicacion revertida' : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="whitespace-nowrap">{formatCurrency(movement.amount)}</span>
                                {!reverseIds.has(movement.id) && (
                                  <button
                                    className={iconButton}
                                    title="Revertir aplicacion"
                                    aria-label={`Revertir aplicacion a ${movement.pedidoDescripcion}`}
                                    disabled={!canMove}
                                    onClick={() => openEditor({ action: 'reverse_application', movement })}
                                  >
                                    <Undo2 size={16} />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!account.advances.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-neutral-500">
                    Sin adelantos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'movements' && (
        <div role="tabpanel" aria-label="Movimientos de saldo" className="overflow-x-auto border-y border-neutral-200">
          <table className="w-full min-w-[780px] text-left">
            <thead className="bg-neutral-50 text-[10px] uppercase text-neutral-500">
              <tr>
                {['Fecha', 'Movimiento', 'Adelanto / pedido', 'Abonos / reintegros', 'Aplicado / anulado', 'Saldo'].map(
                  (label) => (
                    <th key={label} className="px-4 py-3 font-semibold">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {statement?.rows.map((row) => (
                <tr key={row.id} className="border-t border-neutral-100">
                  <td className={`${cell} whitespace-nowrap`}>{formatDate(row.fecha)}</td>
                  <td className={`${cell} max-w-80 break-words`}>
                    <p className="font-semibold">{movementLabel[row.kind]}</p>
                    <p className="text-xs text-neutral-500">{row.referencia}</p>
                    {row.notas && <p className="text-xs text-neutral-500">{row.notas}</p>}
                  </td>
                  <td className={`${cell} max-w-64 break-words`}>
                    {advanceFolio(
                      row.advanceId,
                      account.advances.find((advance) => advance.id === row.advanceId)?.folio,
                    )}
                    <p className="text-xs text-neutral-500">{row.pedidoDescripcion}</p>
                  </td>
                  <td className={`${cell} whitespace-nowrap text-emerald-700`}>
                    {row.credit ? formatCurrency(row.credit) : '-'}
                  </td>
                  <td className={`${cell} whitespace-nowrap`}>{row.debit ? formatCurrency(row.debit) : '-'}</td>
                  <td className={`${cell} whitespace-nowrap font-semibold`}>{formatCurrency(row.balance)}</td>
                </tr>
              ))}
              {!statement?.rows.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-neutral-500">
                    Sin movimientos de saldo en el periodo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'orders' && (
        <div role="tabpanel" aria-label="Pedidos" className="overflow-x-auto border-y border-neutral-200">
          <table className="w-full min-w-[650px] text-left">
            <thead className="bg-neutral-50 text-[10px] uppercase text-neutral-500">
              <tr>
                {['Pedido', 'Total', 'Pagado', 'Pendiente', ''].map((label, index) => (
                  <th key={index} className="px-4 py-3 font-semibold">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {account.pedidos.map((pedido) => (
                <tr key={pedido.id} className="border-t border-neutral-100">
                  <td className={`${cell} max-w-80 break-words`}>
                    <p className="font-semibold">{pedido.descripcion}</p>
                    <p className="text-xs text-neutral-500">
                      {pedido.estado === 'cancelado' ? 'Cancelado' : pedido.fechaPedido}
                    </p>
                  </td>
                  <td className={`${cell} whitespace-nowrap`}>{formatCurrency(pedido.montoTotal)}</td>
                  <td className={`${cell} whitespace-nowrap`}>{formatCurrency(pedido.montoPagado)}</td>
                  <td className={`${cell} whitespace-nowrap`}>{formatCurrency(pendingOrderAmount(pedido))}</td>
                  <td className={cell}>
                    {pendingOrderAmount(pedido) > 0 && (
                      <button
                        className={commandButton}
                        disabled={!canMove}
                        onClick={() => openEditor({ action: 'collect', pedidoId: pedido.id })}
                      >
                        <Plus size={15} /> Registrar cobro
                      </button>
                    )}
                    {pendingOrderAmount(pedido) > 0 && (
                      <button
                        className={commandButton}
                        disabled={!canMove || available <= 0}
                        onClick={() => openEditor({ action: 'apply', pedidoId: pedido.id })}
                      >
                        <ArrowRightLeft size={15} />
                        Aplicar saldo
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!account.pedidos.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-neutral-500">
                    Sin pedidos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {editor && (
        <CustomerAccountForm
          key={`${editor.action}:${editor.advanceId || ''}:${editor.pedidoId || ''}:${editor.movement?.id || ''}`}
          editor={editor}
          account={account}
          clienteId={clienteId}
          busy={busy}
          disabled={!canManageAccount || (!confirmed && !pending.length)}
          error={error}
          pendingCommand={pending[0]}
          onRetry={state.retry}
          onClose={() => setEditor(null)}
          onSubmit={state.submit}
        />
      )}
    </div>
  );
}
