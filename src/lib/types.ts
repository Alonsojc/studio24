export type FormaPago = 'efectivo' | 'tarjeta' | 'transferencia' | 'otro';

export type ConceptoIngreso = 'solo_bordado' | 'bordado_y_prenda' | 'diseno' | 'reparacion' | 'otro';

export type CategoriaEgreso =
  | 'programas'
  | 'mercancia'
  | 'insumos'
  | 'servicios'
  | 'maquinaria'
  | 'publicidad'
  | 'renta'
  | 'otro';

export type SubcategoriaInsumo =
  | 'telas'
  | 'hilos'
  | 'agujas'
  | 'repuestos_maquina'
  | 'estabilizadores'
  | 'otro';

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  direccion: string;
  notas: string;
  createdAt: string;
}

export interface Proveedor {
  id: string;
  nombre: string;
  contacto: string;
  telefono: string;
  email: string;
  tipo: string;
  notas: string;
  createdAt: string;
}

export interface Egreso {
  id: string;
  fecha: string;
  descripcion: string;
  categoria: CategoriaEgreso;
  subcategoria: string;
  proveedorId: string;
  monto: number;
  iva: number;
  montoTotal: number;
  formaPago: FormaPago;
  factura: boolean;
  numeroFactura: string;
  notas: string;
  createdAt: string;
}

export interface EgresoRecurrente {
  id: string;
  descripcion: string;
  categoria: CategoriaEgreso;
  subcategoria: string;
  proveedorId: string;
  monto: number;
  formaPago: FormaPago;
  factura: boolean;
  diaDelMes: number; // 1-28, dia en que se genera
  activo: boolean;
  createdAt: string;
}

export interface Ingreso {
  id: string;
  fecha: string;
  clienteId: string;
  descripcion: string;
  concepto: ConceptoIngreso;
  monto: number;
  iva: number;
  montoTotal: number;
  formaPago: FormaPago;
  factura: boolean;
  numeroFactura: string;
  notas: string;
  createdAt: string;
}
