# Backend local

API de desarrollo para conectar la aplicacion Expo con PostgreSQL. Las credenciales se leen desde `backend/.env`, que no debe subirse al control de versiones.

## Iniciar

Desde la carpeta del proyecto:

Primero crea la base de datos y las tablas con PostgreSQL:

```bash
psql -U postgres -d postgres -f backend/schema.sql
```

Luego inicia el backend:

```bash
npm run backend
```

La API escucha en el puerto `3001`. Comprueba la conexion con `http://localhost:3001/api/health`; los productos se consultan en `http://localhost:3001/api/products` y la tasa actual en `http://localhost:3001/api/exchange-rate`.

La aplicacion utiliza la fila con el `id` mas alto de la tabla `cambio`. Interpreta `cambio_bs` y `cambio_dolares` como divisores de pesos colombianos: pesos / `cambio_bs` = bolivares, y pesos / `cambio_dolares` = dolares. La tasa debe ser mayor que cero. Los dolares se muestran con un decimal.

La ruta `POST /api/products` registra productos con `descripcion`, `cantidad` y `precio_pesos`. La descripcion es obligatoria, la cantidad debe ser un entero no negativo y el precio debe ser un monto no negativo.

`GET /api/products` lista el inventario. `PUT /api/products/:id` actualiza descripcion, cantidad y precio; `DELETE /api/products/:id` elimina solo productos sin historial de ventas. Ambas operaciones requieren la clave `INVENTORY_MANAGEMENT_PASSWORD` en el cuerpo JSON. La clave local es `12345`.

El flujo de ventas usa:

- `POST /api/sales`: crea una venta pendiente en COP, USD o VES; recibe `moneda` y `items`, convierte el precio actual desde COP usando la ultima tasa y guarda los importes en la moneda elegida.
- `GET /api/sales/pending`: devuelve ventas pendientes y sus productos.
- `GET /api/sales/history`: devuelve el detalle de ventas recientes, su moneda, total y estado de confirmacion.
- `POST /api/sales/:id/confirm`: valida stock, descuenta cantidades y marca la venta como confirmada dentro de una transaccion.
- `POST /api/sales/:id/cancel`: pide `SALE_CANCEL_PASSWORD` y elimina solo ventas aun pendientes; los detalles se borran por `ON DELETE CASCADE`.

La clave local para anular es `12345`. La moneda elegida se guarda en `ventas.moneda`; el total y los precios unitarios de `detalle_ventas` se guardan en esa moneda. Los importes en VES se redondean a dos decimales, en USD a un decimal y en COP a enteros. Las ventas en VES o USD requieren tasas mayores que cero.

Al iniciar el backend y cada 24 horas mientras permanezca activo, se eliminan de `ventas` los registros cuya fecha tenga un mes o mas. Esto incluye ventas confirmadas y pendientes; PostgreSQL elimina en cascada sus filas de `detalle_ventas`. Si el backend permanece apagado, la limpieza se ejecuta al volver a iniciarlo. Esta retencion es permanente y los registros eliminados no se pueden recuperar desde la app.

El acceso a la pantalla de tasas y la actualizacion estan protegidos por `RATE_SETTINGS_PASSWORD` en `backend/.env`. Para desarrollo local la clave es `12345`; cambiala antes de compartir el backend con otras personas. Puedes usar `backend/.env.example` como referencia, pero no copies credenciales de ejemplo a un servidor publico. Esta clave es temporal y no debe usarse en un servidor publico.

La configuracion local supone PostgreSQL en `localhost:5432`, base de datos `inventario` y usuario `postgres`. Si tu usuario, host o puerto son diferentes, ajusta `backend/.env`.

Para el emulador Android, configura `EXPO_PUBLIC_API_URL=http://10.0.2.2:3001/api` en el `.env` de la raiz. Para Expo Go en un telefono fisico, usa la direccion IPv4 local de la computadora, por ejemplo `http://192.168.1.10:3001/api`; ambos deben estar en la misma Wi-Fi. Reinicia Expo despues de cambiar `.env`. Si no conecta, permite Node.js o el puerto 3001 en el firewall de Windows para redes privadas.

Este servidor es para desarrollo local: no tiene autenticacion. No lo publiques en internet sin agregar controles de acceso.
