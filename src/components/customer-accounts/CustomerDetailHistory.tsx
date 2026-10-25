'use client';

import { useCustomerAccount } from '@/lib/useCustomerAccount';
import { formatCurrency, formatDate, estadoPedidoLabel } from '@/lib/helpers';

export default function CustomerDetailHistory({ clienteId }: { clienteId: string }) {
  const { account, confirmed, error, refresh } = useCustomerAccount(clienteId);
  if (!confirmed)
    return (
      <div role="status" className="text-sm text-neutral-500">
        {error || 'Consultando movimientos...'}
        {error && (
          <button onClick={() => void refresh()} className="ml-2 font-semibold">
            Reintentar
          </button>
        )}
      </div>
    );
  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-sm font-semibold">Pedidos ({account.pedidos.length})</h3>
        <div className="mt-2 max-h-48 overflow-y-auto">
          {account.pedidos.length ? (
            account.pedidos.map((pedido) => (
              <div key={pedido.id} className="flex gap-3 justify-between border-b border-neutral-100 py-2 text-sm">
                <div className="min-w-0 break-words">
                  {pedido.descripcion}
                  <p className="text-xs text-neutral-500">
                    {estadoPedidoLabel(pedido.estado)} · {formatDate(pedido.fechaPedido)}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums">{formatCurrency(pedido.montoTotal)}</span>
              </div>
            ))
          ) : (
            <p className="py-3 text-sm text-neutral-500">Sin pedidos</p>
          )}
        </div>
      </section>
      <section>
        <h3 className="text-sm font-semibold">Ingresos ({account.ingresos.length})</h3>
        <div className="mt-2 max-h-48 overflow-y-auto">
          {account.ingresos.length ? (
            account.ingresos.map((income) => (
              <div key={income.id} className="flex gap-3 justify-between border-b border-neutral-100 py-2 text-sm">
                <div className="min-w-0 break-words">
                  {income.descripcion}
                  <p className="text-xs text-neutral-500">{formatDate(income.fecha)}</p>
                </div>
                <span className="shrink-0 tabular-nums text-green-600">{formatCurrency(income.montoTotal)}</span>
              </div>
            ))
          ) : (
            <p className="py-3 text-sm text-neutral-500">Sin ingresos</p>
          )}
        </div>
        <p className="mt-3 flex justify-between text-sm font-semibold">
          Total ingresado{' '}
          <span>
            {formatCurrency(account.ingresos.reduce((sum, row) => sum + Math.round(row.montoTotal * 100), 0) / 100)}
          </span>
        </p>
      </section>
    </div>
  );
}
