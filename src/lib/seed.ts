import { v4 as uuid } from 'uuid';
import { Cliente, Proveedor, Egreso, Ingreso } from './types';

export function getSeedClientes(): Cliente[] {
  return [
    { id: uuid(), nombre: 'Uniformes El Sol', telefono: '555-123-4567', email: 'contacto@uniformeselsol.mx', direccion: 'Col. Centro, Monterrey', notas: 'Cliente frecuente, pide bordados en playeras y gorras', createdAt: '2026-01-15T10:00:00Z' },
    { id: uuid(), nombre: 'Restaurant La Parilla', telefono: '555-234-5678', email: 'laparilla@email.com', direccion: 'Av. Garza Sada 1234', notas: 'Mandiles y uniformes de cocina', createdAt: '2026-02-10T10:00:00Z' },
    { id: uuid(), nombre: 'Maria Lopez', telefono: '555-345-6789', email: 'maria.lopez@gmail.com', direccion: '', notas: 'Clienta particular, bordados personalizados', createdAt: '2026-03-01T10:00:00Z' },
    { id: uuid(), nombre: 'Escuela Primaria Benito Juarez', telefono: '555-456-7890', email: 'escuela.bj@edu.mx', direccion: 'Calle Educacion 456', notas: 'Bordado de escudos en uniformes escolares', createdAt: '2026-01-20T10:00:00Z' },
    { id: uuid(), nombre: 'Taller Mecanico Gonzalez', telefono: '555-567-8901', email: '', direccion: 'Col. Industrial', notas: 'Overoles y camisas con logo', createdAt: '2026-03-15T10:00:00Z' },
  ];
}

export function getSeedProveedores(): Proveedor[] {
  return [
    { id: uuid(), nombre: 'Amazon', contacto: '', telefono: '', email: '', tipo: 'Software/Digital', notas: 'Compras de insumos varios y accesorios', createdAt: '2026-01-01T10:00:00Z' },
    { id: uuid(), nombre: 'UNITAM Textiles', contacto: 'Carlos Hernandez', telefono: '555-111-2222', email: 'ventas@unitam.mx', tipo: 'Telas y textiles', notas: 'Proveedor principal de telas', createdAt: '2026-01-01T10:00:00Z' },
    { id: uuid(), nombre: 'DINKO Bordados', contacto: 'Ana Martinez', telefono: '555-333-4444', email: 'info@dinko.mx', tipo: 'Insumos de bordado', notas: 'Hilos, agujas y estabilizadores', createdAt: '2026-01-01T10:00:00Z' },
    { id: uuid(), nombre: 'Impresion Publicitaria MX', contacto: 'Roberto Paz', telefono: '555-555-6666', email: 'rp@impresionpub.mx', tipo: 'Publicidad e impresion', notas: 'Tarjetas, volantes y publicidad', createdAt: '2026-01-01T10:00:00Z' },
  ];
}

export function getSeedEgresos(proveedorIds: string[]): Egreso[] {
  return [
    { id: uuid(), fecha: '2026-01-05', descripcion: 'Suscripcion Canva Pro', categoria: 'programas', subcategoria: 'Canva', proveedorId: '', monto: 129, iva: 0, montoTotal: 129, formaPago: 'tarjeta', factura: false, numeroFactura: '', notas: '', createdAt: '2026-01-05T10:00:00Z' },
    { id: uuid(), fecha: '2026-01-10', descripcion: 'Compra de hilos DMC 20 colores', categoria: 'insumos', subcategoria: 'Hilos', proveedorId: proveedorIds[2] || '', monto: 850, iva: 136, montoTotal: 986, formaPago: 'transferencia', factura: true, numeroFactura: 'FAC-001', notas: '', createdAt: '2026-01-10T10:00:00Z' },
    { id: uuid(), fecha: '2026-01-20', descripcion: 'Tela popelina 10 metros', categoria: 'insumos', subcategoria: 'Telas', proveedorId: proveedorIds[1] || '', monto: 450, iva: 72, montoTotal: 522, formaPago: 'efectivo', factura: true, numeroFactura: 'FAC-002', notas: '', createdAt: '2026-01-20T10:00:00Z' },
    { id: uuid(), fecha: '2026-02-01', descripcion: 'Suscripcion Adobe Photoshop', categoria: 'programas', subcategoria: 'Photoshop', proveedorId: '', monto: 232, iva: 37.12, montoTotal: 269.12, formaPago: 'tarjeta', factura: true, numeroFactura: 'ADB-2026-02', notas: 'Mensual', createdAt: '2026-02-01T10:00:00Z' },
    { id: uuid(), fecha: '2026-02-15', descripcion: 'Agujas para maquina Tajima', categoria: 'insumos', subcategoria: 'Agujas', proveedorId: proveedorIds[2] || '', monto: 320, iva: 51.2, montoTotal: 371.2, formaPago: 'transferencia', factura: true, numeroFactura: 'FAC-003', notas: 'Paquete de 50 agujas', createdAt: '2026-02-15T10:00:00Z' },
    { id: uuid(), fecha: '2026-03-01', descripcion: 'Volantes publicitarios 500 pzas', categoria: 'publicidad', subcategoria: '', proveedorId: proveedorIds[3] || '', monto: 600, iva: 96, montoTotal: 696, formaPago: 'efectivo', factura: true, numeroFactura: 'FAC-004', notas: '', createdAt: '2026-03-01T10:00:00Z' },
    { id: uuid(), fecha: '2026-03-10', descripcion: 'Estabilizadores para bordado', categoria: 'insumos', subcategoria: 'Estabilizadores', proveedorId: proveedorIds[2] || '', monto: 280, iva: 44.8, montoTotal: 324.8, formaPago: 'transferencia', factura: true, numeroFactura: 'FAC-005', notas: '', createdAt: '2026-03-10T10:00:00Z' },
    { id: uuid(), fecha: '2026-03-25', descripcion: 'Renta del local marzo', categoria: 'renta', subcategoria: '', proveedorId: '', monto: 3500, iva: 0, montoTotal: 3500, formaPago: 'transferencia', factura: false, numeroFactura: '', notas: '', createdAt: '2026-03-25T10:00:00Z' },
    { id: uuid(), fecha: '2026-04-01', descripcion: 'Suscripcion Canva Pro abril', categoria: 'programas', subcategoria: 'Canva', proveedorId: '', monto: 129, iva: 0, montoTotal: 129, formaPago: 'tarjeta', factura: false, numeroFactura: '', notas: '', createdAt: '2026-04-01T10:00:00Z' },
    { id: uuid(), fecha: '2026-04-05', descripcion: 'Hilos metalicos especiales', categoria: 'insumos', subcategoria: 'Hilos', proveedorId: proveedorIds[2] || '', monto: 420, iva: 67.2, montoTotal: 487.2, formaPago: 'tarjeta', factura: true, numeroFactura: 'FAC-006', notas: '', createdAt: '2026-04-05T10:00:00Z' },
    { id: uuid(), fecha: '2026-04-10', descripcion: 'Renta del local abril', categoria: 'renta', subcategoria: '', proveedorId: '', monto: 3500, iva: 0, montoTotal: 3500, formaPago: 'transferencia', factura: false, numeroFactura: '', notas: '', createdAt: '2026-04-10T10:00:00Z' },
  ];
}

export function getSeedIngresos(clienteIds: string[]): Ingreso[] {
  return [
    { id: uuid(), fecha: '2026-01-15', clienteId: clienteIds[0] || '', descripcion: 'Bordado de logo en 20 playeras polo', concepto: 'bordado_y_prenda', monto: 3000, iva: 480, montoTotal: 3480, formaPago: 'transferencia', factura: true, numeroFactura: 'ING-001', notas: '', createdAt: '2026-01-15T10:00:00Z' },
    { id: uuid(), fecha: '2026-01-22', clienteId: clienteIds[3] || '', descripcion: 'Escudos bordados en 50 uniformes', concepto: 'solo_bordado', monto: 5000, iva: 800, montoTotal: 5800, formaPago: 'transferencia', factura: true, numeroFactura: 'ING-002', notas: 'Entrega a domicilio', createdAt: '2026-01-22T10:00:00Z' },
    { id: uuid(), fecha: '2026-02-05', clienteId: clienteIds[1] || '', descripcion: 'Bordado en 10 mandiles de cocina', concepto: 'bordado_y_prenda', monto: 1800, iva: 288, montoTotal: 2088, formaPago: 'efectivo', factura: true, numeroFactura: 'ING-003', notas: '', createdAt: '2026-02-05T10:00:00Z' },
    { id: uuid(), fecha: '2026-02-14', clienteId: clienteIds[2] || '', descripcion: 'Bordado personalizado en chamarra', concepto: 'solo_bordado', monto: 450, iva: 0, montoTotal: 450, formaPago: 'efectivo', factura: false, numeroFactura: '', notas: 'Nombre y diseno de rosas', createdAt: '2026-02-14T10:00:00Z' },
    { id: uuid(), fecha: '2026-02-28', clienteId: clienteIds[0] || '', descripcion: 'Gorras bordadas x15', concepto: 'bordado_y_prenda', monto: 2250, iva: 360, montoTotal: 2610, formaPago: 'tarjeta', factura: true, numeroFactura: 'ING-004', notas: '', createdAt: '2026-02-28T10:00:00Z' },
    { id: uuid(), fecha: '2026-03-05', clienteId: clienteIds[4] || '', descripcion: 'Overoles con logo bordado x8', concepto: 'bordado_y_prenda', monto: 2400, iva: 384, montoTotal: 2784, formaPago: 'transferencia', factura: true, numeroFactura: 'ING-005', notas: '', createdAt: '2026-03-05T10:00:00Z' },
    { id: uuid(), fecha: '2026-03-12', clienteId: clienteIds[2] || '', descripcion: 'Diseno de logo para bordado', concepto: 'diseno', monto: 800, iva: 0, montoTotal: 800, formaPago: 'efectivo', factura: false, numeroFactura: '', notas: 'Diseno desde cero', createdAt: '2026-03-12T10:00:00Z' },
    { id: uuid(), fecha: '2026-03-20', clienteId: clienteIds[3] || '', descripcion: 'Segundo lote uniformes escolares x30', concepto: 'solo_bordado', monto: 3000, iva: 480, montoTotal: 3480, formaPago: 'transferencia', factura: true, numeroFactura: 'ING-006', notas: '', createdAt: '2026-03-20T10:00:00Z' },
    { id: uuid(), fecha: '2026-04-02', clienteId: clienteIds[0] || '', descripcion: 'Camisas corporativas bordadas x25', concepto: 'bordado_y_prenda', monto: 4375, iva: 700, montoTotal: 5075, formaPago: 'transferencia', factura: true, numeroFactura: 'ING-007', notas: 'Logo frontal y nombre en manga', createdAt: '2026-04-02T10:00:00Z' },
    { id: uuid(), fecha: '2026-04-08', clienteId: clienteIds[1] || '', descripcion: 'Servilletas bordadas para evento', concepto: 'solo_bordado', monto: 1200, iva: 192, montoTotal: 1392, formaPago: 'tarjeta', factura: true, numeroFactura: 'ING-008', notas: '50 servilletas con iniciales', createdAt: '2026-04-08T10:00:00Z' },
    { id: uuid(), fecha: '2026-04-12', clienteId: clienteIds[2] || '', descripcion: 'Reparacion de bordado en vestido', concepto: 'reparacion', monto: 350, iva: 0, montoTotal: 350, formaPago: 'efectivo', factura: false, numeroFactura: '', notas: '', createdAt: '2026-04-12T10:00:00Z' },
  ];
}
