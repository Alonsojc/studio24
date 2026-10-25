# Integridad de facturas y cobros

## Alcance

- El parser CFDI toma el IVA del resumen global una vez y usa conceptos solo
  cuando no existe resumen. No confunde IEPS con IVA. La base nueva descuenta
  `Descuento`; solo se importan CFDI I timbrados en MXN.
- La identidad de una factura es su UUID. Importe, fecha y RFC generan
  candidatos, pero la vinculacion requiere seleccion explicita. Un reintento
  conserva el ID y confirma primero su operacion pendiente.
- La importacion espera la consulta de ingresos y egresos. Crear un registro
  nuevo tambien requiere seleccion explicita, incluso si no hay candidatos.
- Un cobro respaldado por el libro de adelantos admite el desglose de base e
  IVA al vincular su primer CFDI mediante la sincronizacion transaccional.
  Conserva importe total, cliente, pedido, fecha, forma de pago y movimientos;
  no permite editar impuestos libremente ni generar efectivo adicional.
- Reemplazar factura valida RFC, UUID e importe; guarda objetos nuevos y solo
  cambia las referencias cuando se han subido. No borra versiones anteriores
  ni altera importes historicos. La auditoria conserva las rutas previas.
- Un error de sincronizacion no se presenta como guardado confirmado. Revisar
  los conflictos antes de reenviar archivos o registrar cobros.
- El enlace de recuperacion conserva `/ajustes` como destino autorizado, pero
  `PASSWORD_RECOVERY` abre un formulario separado antes de montar datos del
  negocio. Tras actualizar la contrasena se reinicia la sesion de la app.
- `undici` se actualiza dentro de sus ramas compatibles en el lockfile.

## Publicacion y verificacion

Aplicar `20261025174424_finance_reliability.sql` antes de desplegar el frontend.
No contiene reparaciones ni actualizaciones de datos historicos. Comprobar
lint, unitarias, build, navegador aislado y `scripts/test-db.sh`. El workflow
de respaldo hace un simulacro adicional con cada copia cifrada.

Los objetos antiguos y cargas incompletas se conservan deliberadamente.
Su limpieza requiere comprobar referencias actuales y auditoria; no borrar
por antiguedad ni eliminar archivos para forzar una reimportacion. La
recuperacion de contrasena usa una sesion valida de Supabase; no cambia los
permisos del equipo ni reemplaza la politica de redirecciones del proveedor.
