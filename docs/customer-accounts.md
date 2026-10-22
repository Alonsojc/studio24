# Adelantos y cuenta de cliente

## Flujo

Desde Clientes, abrir "Cuenta y movimientos". Administracion y contabilidad pueden registrar y aplicar adelantos; solo administracion puede anular una captura.

- El total de la tarjeta es el ingreso acumulado de la clienta, no su saldo a favor ni necesariamente un monto facturado. El importe y "Cuenta y movimientos" abren el historial de ingresos, incluyendo cobros directos sin pedido. Los accesos de registrar adelanto y de pedidos conservan su destino especifico.
- Clientes inicia con "Con pedidos", ocultando las cuentas sin pedidos. El filtro permite "Solo pedidos activos" (excluye entregados/cancelados) o "Todos los clientes". El orden puede ser alfabetico, por importe/cantidad de ingresos, pendiente o pedidos activos. El pendiente considera todos los pedidos no cancelados, incluidos entregados aun sin liquidar, y descuenta pagos/credito aplicado; no es el saldo a favor. Los filtros se combinan con la busqueda sin alterar los registros.
- La cuenta y sus PDF/Excel muestran ingresos, adelantos y movimientos de saldo por separado. Un ingreso historico no se convierte en saldo disponible ni crea un pedido; vincularlo como adelanto sigue siendo una operacion financiera explicita.
- Nuevo cobro: crea un ingreso y un adelanto en la misma transaccion. Confirmar que el dinero no esta registrado en Ingresos ni en los pagos de un pedido.
- Ingreso existente: vincula un ingreso positivo de la misma clienta, sin pedido y sin otro adelanto vigente. No crea otro cobro.
- Al volver a vincular un ingreso cuyo adelanto se anulo, la nueva disponibilidad no se fecha antes de su ultimo movimiento anterior. La fecha original del ingreso no cambia y los cortes historicos no duplican ese dinero.
- Aplicar saldo: consume un adelanto hasta el menor entre disponible y pendiente del pedido. Un adelanto puede pagar varios pedidos; varios adelantos pueden pagar un pedido.
- Revertir aplicacion: conserva ambos movimientos y devuelve el importe al adelanto. No registra una devolucion de efectivo.
- Anular captura: requiere motivo y todas las aplicaciones revertidas. Si era nuevo cobro, pone su ingreso en cero; si era ingreso existente, lo conserva. No permite anular un ingreso con factura. No es un flujo de reembolso.
- PDF y Excel: periodo inclusivo, saldo inicial, movimientos, aplicaciones/reversas y saldo al corte. El pendiente de pedidos se identifica como actual, no historico.

## Integridad y nube

La migracion `20261019233010_customer_advances_ledger.sql` debe aplicarse antes de publicar el cliente. Es aditiva: no transforma movimientos historicos ni asigna automaticamente saldos.

`customer_account_command` valida sesion, equipo, rol, clienta, importes y fechas. Serializa la cuenta por clienta y bloquea el pedido/ingreso correspondiente. Cada operacion usa un UUID persistente; una respuesta perdida se reintenta con el mismo UUID y contenido. No hay movimientos financieros optimistas ni envios automaticos sin conexion.

Las tablas `customer_advances` y `customer_account_movements` solo admiten lectura financiera por RLS. Los pagos con `origen=saldo_cliente` y los cobros que respaldan adelantos no pueden alterarse desde el CRUD generico. Los conflictos requieren revision explicita desde el indicador de sincronizacion.

El comprobante opcional se sube antes del cobro a `customer-receipts`, privado, con limite de 10 MB y PDF/JPG/PNG. El acceso usa URL firmada de 60 segundos. Los objetos ligados no se pueden sobrescribir ni borrar. Si falla una validacion despues de subirlo, puede quedar un objeto sin ligar; no crea dinero y su politica permite eliminarlo.

Los respaldos JSON incluyen el historial de nube y las versiones canonicas de sus pedidos/ingresos/clientas. Restaurar un respaldo no reproduce comandos ni cobros: conserva el historial vigente del servidor. Si el archivo contiene movimientos inexistentes en nube, se exige recuperacion de base de datos. Como los demas archivos binarios, los comprobantes no van dentro del JSON.

## Validacion

- `npm run lint`, `npm test`, `npm run build`.
- Playwright existente: `npx playwright test e2e/isolated.spec.ts`, con Supabase/Sentry simulados.
- `TEST_DATABASE_URL=postgres://...@127.0.0.1:5432/studio24_test bash scripts/test-db.sh`, exclusivamente sobre una base local vacia. Reproduce migraciones, permisos, idempotencia, reversas, respaldo del cobro y carreras entre sesiones PostgreSQL reales.
- Validacion manual aislada: nuevo cobro con comprobante, respuesta perdida despues del commit, reintento, ingreso existente, aplicacion, reversa, anulacion y descargas en escritorio/celular. No usar movimientos reales para probar.

Es control interno de caja y aplicacion de saldos; el estado de cuenta no es CFDI. No cambia el reconocimiento fiscal ni implementa reembolsos, intereses, conversion de moneda o migracion automatica de pagos historicos.
