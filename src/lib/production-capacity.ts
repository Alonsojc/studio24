import type { Pedido } from './types';

export interface MachineLoad {
  maquina: string;
  pedidos: number;
  piezas: number;
  urgentes: number;
  atrasados: number;
}

const ACTIVE_STATES = new Set(['pendiente', 'diseno', 'aprobado', 'en_maquina', 'terminado']);

export function isPedidoOverdue(pedido: Pick<Pedido, 'fechaEntrega' | 'estado'>, today = new Date()): boolean {
  if (!pedido.fechaEntrega || pedido.estado === 'entregado' || pedido.estado === 'cancelado') return false;
  const due = new Date(`${pedido.fechaEntrega}T23:59:59`);
  return due.getTime() < today.getTime();
}

export function calculateMachineLoads(pedidos: Pedido[], today = new Date()): MachineLoad[] {
  const loads = new Map<string, MachineLoad>();

  for (const pedido of pedidos) {
    if (!ACTIVE_STATES.has(pedido.estado)) continue;
    const maquina = pedido.maquina || 'Sin asignar';
    const current = loads.get(maquina) || {
      maquina,
      pedidos: 0,
      piezas: 0,
      urgentes: 0,
      atrasados: 0,
    };
    current.pedidos += 1;
    current.piezas += pedido.piezas || 0;
    if (pedido.urgente) current.urgentes += 1;
    if (isPedidoOverdue(pedido, today)) current.atrasados += 1;
    loads.set(maquina, current);
  }

  return [...loads.values()].sort(
    (a, b) => b.atrasados - a.atrasados || b.urgentes - a.urgentes || b.piezas - a.piezas,
  );
}
