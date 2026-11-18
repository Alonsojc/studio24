# Cotizaciones, pedidos e ingresos

- **Cotizador:** convierte desde el historial. Una cotizacion sin clienta guardada
  pide confirmarla. Una cotizacion convertida conserva sus partidas y total;
  `Ver pedido` abre ese pedido, incluso si ya no esta activo.
- **Ingresos:** el boton de vinculo aparece en las filas con clienta e importe
  positivo. Si el pago ya figura en el pedido, vincularlo no aumenta lo pagado.
  Si se aplica al pendiente, el pedido reconoce ese importe pero no se crea otro
  ingreso. Los adelantos activos siguen administrandose desde Cuenta y movimientos.
- **Pedidos > Pagos:** registra solamente cobros previos que no existan en Ingresos.
  El IVA incluido se desglosa del total recibido. Se conservan fechas y metodos
  reales; si un pago viejo no tiene detalle, ese dato se pide antes de guardar.
  El registro no timbra ni emite un CFDI.

## Publicacion

La publicacion de Pages no aplica automaticamente
[`20261118192033_quote_orders_and_income_links.sql`](../supabase/migrations/20261118192033_quote_orders_and_income_links.sql).
Primero ensayar con la suite de PostgreSQL y el navegador aislado. Coordinar la
migracion de Supabase con el despliegue de Pages, con un respaldo reciente
verificado. Aplicar la migracion antes de publicar el frontend en la misma ventana:
el esquema y el simulacro de respaldo deben quedar en la misma version.

No se deben inferir ni rellenar vinculos historicos en produccion. La migracion
no modifica importes, fechas ni registros existentes. Una vez aplicada, el viejo
boton de crear ingresos desde Pedidos ya no puede escribir directamente. Indicar
al equipo que recargue cuando se publique la version nueva. Verificar acceso y
rutas sin insertar cobros de prueba en el negocio.

Los respaldos JSON de Ajustes conservan los vinculos ya confirmados en la nube.
Un respaldo que contiene vinculos ausentes exige recuperacion completa del
esquema compatible, no volver a importar cobros individuales.
