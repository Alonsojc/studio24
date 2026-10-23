'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CUSTOMER_COMMAND_PREFIX, KEYS } from './store';
import {
  cachedCustomerAccount,
  loadCustomerAccount,
  newCustomerCommand,
  pendingCustomerCommands,
  runCustomerCommand,
  type CustomerCommand,
} from './customer-accounts';

export function useCustomerAccount(clienteId: string) {
  const [account, setAccount] = useState(() => cachedCustomerAccount(clienteId));
  const [confirmed, setConfirmed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(() => pendingCustomerCommands(clienteId));
  const revision = useRef(0);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    if (!clienteId) return;
    const request = ++revision.current;
    setRefreshing(true);
    setConfirmed(false);
    try {
      const next = await loadCustomerAccount(clienteId);
      if (mounted.current && request === revision.current) {
        setAccount(next);
        setConfirmed(true);
        setError('');
      }
    } catch (error) {
      if (mounted.current && request === revision.current)
        setError(error instanceof Error ? error.message : 'No se pudo consultar la cuenta');
    } finally {
      if (mounted.current && request === revision.current) setRefreshing(false);
    }
  }, [clienteId]);
  useEffect(() => {
    mounted.current = true;
    const initialRefresh = setTimeout(() => void refresh(), 0);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = (event: StorageEvent) => {
      setPending(pendingCustomerCommands(clienteId));
      if (
        !event.key ||
        [KEYS.customerAdvances, KEYS.customerMovements, KEYS.pedidos, KEYS.ingresos].includes(
          event.key as typeof KEYS.pedidos,
        ) ||
        event.key.startsWith(CUSTOMER_COMMAND_PREFIX)
      ) {
        setConfirmed(false);
        clearTimeout(timer);
        timer = setTimeout(() => void refresh(), 300);
      }
    };
    window.addEventListener('storage', update);
    return () => {
      mounted.current = false;
      clearTimeout(initialRefresh);
      clearTimeout(timer);
      window.removeEventListener('storage', update);
    };
  }, [clienteId, refresh]);
  const execute = async (command: CustomerCommand, receipt?: File) => {
    setBusy(true);
    setError('');
    ++revision.current;
    try {
      const next = await runCustomerCommand(command, receipt);
      if (mounted.current) {
        setAccount(next);
        setConfirmed(true);
      }
      return true;
    } catch (error) {
      if (mounted.current) {
        setError(error instanceof Error ? error.message : 'No se pudo confirmar el movimiento');
        setConfirmed(false);
      }
      return false;
    } finally {
      if (mounted.current) {
        setBusy(false);
        setRefreshing(false);
        setPending(pendingCustomerCommands(clienteId));
      }
    }
  };
  const submit = (action: CustomerCommand['action'], data: CustomerCommand['data'], receipt?: File) =>
    execute(newCustomerCommand(action, data), receipt);
  return { account, confirmed, refreshing, busy, error, pending, refresh, submit, retry: execute };
}
