'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import CustomerAccountView from '@/components/customer-accounts/CustomerAccountView';

function AccountPage() {
  const search = useSearchParams();
  const clienteId = search.get('cliente') || '';
  const initialAction =
    search.get('accion') === 'adelanto' ? 'receive' : search.get('accion') === 'cobro' ? 'collect' : undefined;
  return (
    <CustomerAccountView
      key={`${clienteId}:${initialAction || ''}:${search.get('pedido') || ''}`}
      clienteId={clienteId}
      pedidoId={search.get('pedido') || ''}
      initialAction={initialAction}
    />
  );
}
export default function Page() {
  return (
    <Suspense fallback={<p className="py-6 text-sm text-neutral-500">Consultando cuenta...</p>}>
      <AccountPage />
    </Suspense>
  );
}
