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

export type SubcategoriaInsumo = 'telas' | 'hilos' | 'agujas' | 'repuestos_maquina' | 'estabilizadores' | 'otro';

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  direccion: string;
  logo: string;
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
  logo: string;
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

export type EstadoPedido = 'pendiente' | 'diseno' | 'aprobado' | 'en_maquina' | 'terminado' | 'entregado' | 'cancelado';

export type EstadoPago = 'pendiente' | 'parcial' | 'pagado';

export interface Pedido {
  id: string;
  clienteId: string;
  descripcion: string;
  concepto: ConceptoIngreso;
  piezas: number;
  precioUnitario: number;
  montoTotal: number;
  costoMateriales: number;
  estado: EstadoPedido;
  estadoPago: EstadoPago;
  montoPagado: number;
  maquina: string;
  archivoDiseno: string;
  fotos: string[];
  checklist: {
    archivoListo: boolean;
    hilosCargados: boolean;
    aroColocado: boolean;
    estabilizador: boolean;
    pruebaHecha: boolean;
  };
  fechaPedido: string;
  fechaEntrega: string;
  fechaEntregaReal: string;
  urgente: boolean;
  notas: string;
  createdAt: string;
}

export interface Ingreso {
  id: string;
  fecha: string;
  clienteId: string;
  pedidoId?: string;
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

export interface Cotizacion {
  id: string;
  folio: string;
  clienteNombre: string;
  clienteEmpresa: string;
  items: { descripcion: string; cantidad: number; precioUnitario: number }[];
  conIVA: boolean;
  notas: string;
  subtotal: number;
  iva: number;
  total: number;
  createdAt: string;
}

export type CategoriaProducto = 'bordado' | 'prenda' | 'servicio' | 'otro';

export interface Producto {
  id: string;
  nombre: string;
  categoria: CategoriaProducto;
  precio: number;
  activo: boolean;
  createdAt: string;
}

// --- Inventario ---

export type CategoriaInventario = 'hilo' | 'prenda' | 'insumo' | 'repuesto' | 'otro';
export type UnidadInventario = 'piezas' | 'conos' | 'metros' | 'rollos' | 'paquetes' | 'unidades';

export interface ItemInventario {
  id: string;
  nombre: string;
  categoria: CategoriaInventario;
  unidad: UnidadInventario;
  stock: number;
  stockMinimo: number;
  costo: number;
  color: string;
  marca: string;
  ubicacion: string;
  notas: string;
  createdAt: string;
}

// --- Biblioteca de diseños ---

export interface Diseno {
  id: string;
  nombre: string;
  archivo: string;
  clienteId: string;
  puntadas: number;
  colores: number;
  ancho: number;
  alto: number;
  tags: string[];
  notas: string;
  createdAt: string;
}

// --- Plantillas WhatsApp ---

export interface PlantillaWhatsApp {
  id: string;
  nombre: string;
  mensaje: string;
  createdAt: string;
}

export interface ConfigNegocio {
  nombreNegocio: string;
  titular: string;
  banco: string;
  numeroCuenta: string;
  clabe: string;
  telefono: string;
  email: string;
  direccion: string;
  logoUrl: string;
}
