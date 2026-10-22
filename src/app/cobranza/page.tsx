'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageCircle, CalendarDays, Wallet, Search } from 'lucide-react';
import { useCloudResource } from '@/lib/useCloudStore';
import {
  fetchCollections,
  emptyCollections,
  daysOverdue,
  collectionWhatsApp,
  collectionAccountPath,
  saveCollectionFollowup,
  type CollectionRow,
  type CollectionPage,
  type CollectionFilter,
} from '@/lib/collections';
import { customerAccountToday } from '@/lib/customer-accounts';
import { formatCurrency, formatDate } from '@/lib/helpers';
import PageHeader from '@/components/PageHeader';
import Pagination from '@/components/Pagination';
import Modal from '@/components/Modal';
import { inputClass, btnPrimary, btnSecondary, labelClass } from '@/lib/styles';

function CollectionActions({
  row,
  syncing,
  edit,
}: {
  row: CollectionRow;
  syncing: boolean;
  edit: (row: CollectionRow) => void;
}) {
  const whatsapp = collectionWhatsApp(row);
  const account = collectionAccountPath(row);
  return (
    <div className="flex gap-1 md:justify-end">
      {account && (
        <Link
          href={account}
          title="Cuenta y estado de cuenta"
          aria-label={`Cuenta de ${row.clienteNombre}`}
          className="p-3 rounded-lg hover:bg-neutral-100"
        >
          <Wallet size={17} />
        </Link>
      )}
      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          title="Preparar recordatorio de WhatsApp"
          aria-label={`WhatsApp a ${row.clienteNombre}`}
          className="p-3 rounded-lg hover:bg-neutral-100 text-green-700"
        >
          <MessageCircle size={17} />
        </a>
      )}
      <button
        type="button"
        disabled={syncing}
        onClick={() => edit(row)}
        title="Programar seguimiento"
        aria-label={`Seguimiento de ${row.descripcion}`}
        className="p-3 rounded-lg hover:bg-neutral-100 disabled:opacity-40"
      >
        <CalendarDays size={17} />
      </button>
    </div>
  );
}

export default function CollectionsPage() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CollectionFilter>('all');
  const [editing, setEditing] = useState<CollectionRow | null>(null);
  const [due, setDue] = useState('');
  const [next, setNext] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const key = `bordados_collections:${filter}:${query}:${page}`;
  const { data, reload, syncing } = useCloudResource(
    () => {
      try {
        const cached =
          typeof window === 'undefined'
            ? null
            : (JSON.parse(localStorage.getItem(key) || 'null') as CollectionPage | null);
        return cached && Array.isArray(cached.rows) ? cached : emptyCollections;
      } catch {
        return emptyCollections;
      }
    },
    () => fetchCollections(page, query, filter),
    key,
    [page, query, filter],
  );
  const today = customerAccountToday();
  const edit = (row: CollectionRow) => {
    setEditing(row);
    setDue(row.paymentDueDate || '');
    setNext(row.nextFollowupDate || '');
    setNotes(row.collectionNotes || '');
    setError('');
  };
  return (
    <div>
      <PageHeader
        title="Cobranza"
        description={`${data.total} ${data.total === 1 ? 'pedido' : 'pedidos'} con saldo pendiente`}
      />
      <dl className="grid grid-cols-3 gap-3 border-y border-neutral-200 py-5 mb-6">
        <div>
          <dt className="text-[10px] text-neutral-500 uppercase">Por cobrar</dt>
          <dd className="text-lg font-bold text-red-600 mt-1 break-all tabular-nums">
            {formatCurrency(data.totalPending)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] text-neutral-500 uppercase">Vencido</dt>
          <dd className="text-lg font-bold text-red-600 mt-1 break-all tabular-nums">
            {formatCurrency(data.overduePending)}
          </dd>
          <p className="text-xs text-neutral-500">{data.overdueCount} pedidos</p>
        </div>
        <div>
          <dt className="text-[10px] text-neutral-500 uppercase">Seguimientos</dt>
          <dd className="text-lg font-bold mt-1 tabular-nums">{data.followupCount}</dd>
          <p className="text-xs text-neutral-500">Hoy y vencidos</p>
        </div>
      </dl>
      <div className="flex flex-wrap gap-3 mb-5">
        <label className="relative min-w-0 flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-3 text-neutral-400" />
          <input
            aria-label="Buscar cobranza"
            maxLength={200}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cliente o pedido"
            className={`${inputClass} pl-10`}
          />
        </label>
        <select
          aria-label="Filtrar cobranza"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value as CollectionFilter);
            setPage(0);
          }}
          className={inputClass + ' !w-auto'}
        >
          <option value="all">Todos los pendientes</option>
          <option value="overdue">Vencidos</option>
          <option value="followup">Seguimiento hoy</option>
        </select>
      </div>
      <div className="overflow-x-auto border-y border-neutral-200">
        <table className="w-full text-sm md:min-w-[940px]">
          <thead>
            <tr className="text-left text-xs text-neutral-500 border-b border-neutral-200">
              {['Cliente / pedido', 'Pendiente', 'Vencimiento', 'Ultimo abono', 'Seguimiento', ''].map(
                (title, index) => (
                  <th key={title} className={`py-3 px-3 font-medium ${index > 1 ? 'hidden md:table-cell' : ''}`}>
                    {title}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => {
              const late = daysOverdue(row.paymentDueDate, today);
              const account = collectionAccountPath(row);
              return (
                <tr key={row.id} className="border-b border-neutral-100 align-top">
                  <td className="py-4 px-3 max-w-xs">
                    {account ? (
                      <Link href={account} className="font-semibold hover:underline">
                        {row.clienteNombre}
                      </Link>
                    ) : (
                      <span className="font-semibold text-amber-800">Cliente no disponible</span>
                    )}
                    <p className="text-xs text-neutral-500 mt-1 break-words">{row.descripcion}</p>
                    <div className="md:hidden text-xs text-neutral-500 mt-3 space-y-1">
                      <p>
                        {row.paymentDueDate ? `Vence: ${formatDate(row.paymentDueDate)}` : 'Sin vencimiento'}
                        {late > 0 && <span className="block text-red-600">{late} dias de atraso</span>}
                      </p>
                      <p>Ultimo abono: {row.lastPaymentDate ? formatDate(row.lastPaymentDate) : 'Sin fecha'}</p>
                      <p>Seguimiento: {row.nextFollowupDate ? formatDate(row.nextFollowupDate) : 'Sin programar'}</p>
                      {row.collectionNotes && <p className="whitespace-pre-wrap break-words">{row.collectionNotes}</p>}
                      <CollectionActions row={row} syncing={syncing} edit={edit} />
                    </div>
                  </td>
                  <td className="py-4 px-3 text-red-600 font-semibold whitespace-nowrap">
                    {formatCurrency(row.pending)}
                  </td>
                  <td className="hidden md:table-cell py-4 px-3 text-xs">
                    {row.paymentDueDate ? formatDate(row.paymentDueDate) : 'Sin vencimiento'}
                    {late > 0 && <p className="text-red-600 mt-1">{late} dias de atraso</p>}
                  </td>
                  <td className="hidden md:table-cell py-4 px-3 text-xs">
                    {row.lastPaymentDate ? formatDate(row.lastPaymentDate) : 'Sin fecha registrada'}
                  </td>
                  <td className="hidden md:table-cell py-4 px-3 text-xs max-w-[220px]">
                    {row.nextFollowupDate ? formatDate(row.nextFollowupDate) : 'Sin programar'}
                    <p className="text-neutral-500 mt-1 whitespace-pre-wrap break-words">{row.collectionNotes}</p>
                  </td>
                  <td className="hidden md:table-cell py-3 px-3">
                    <CollectionActions row={row} syncing={syncing} edit={edit} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data.rows.length === 0 && (
          <p className="py-12 text-center text-sm text-neutral-500">Sin pedidos pendientes en este filtro.</p>
        )}
      </div>
      <Pagination total={data.total} page={page} onPageChange={setPage} />
      <Modal
        open={Boolean(editing)}
        onClose={() => {
          if (!busy) setEditing(null);
        }}
        title="Seguimiento de cobranza"
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!editing || busy) return;
            setBusy(true);
            setError('');
            try {
              await saveCollectionFollowup(editing, due, next, notes);
              setEditing(null);
              reload();
            } catch (error) {
              setError(error instanceof Error ? error.message : 'No se pudo guardar');
            } finally {
              setBusy(false);
            }
          }}
          className="space-y-4"
        >
          <p className="text-sm font-semibold">
            {editing?.clienteNombre || 'Cliente no disponible'} · {editing?.descripcion}
          </p>
          <div>
            <label htmlFor="collection-due" className={labelClass}>
              Vencimiento de pago
            </label>
            <input
              id="collection-due"
              type="date"
              value={due}
              onChange={(event) => setDue(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="collection-next" className={labelClass}>
              Proximo seguimiento
            </label>
            <input
              id="collection-next"
              type="date"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="collection-notes" className={labelClass}>
              Notas
            </label>
            <textarea
              id="collection-notes"
              maxLength={2000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={inputClass}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" disabled={busy} onClick={() => setEditing(null)} className={btnSecondary}>
              Cancelar
            </button>
            <button disabled={busy} className={btnPrimary}>
              {busy ? 'Guardando...' : 'Guardar seguimiento'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
