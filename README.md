# Inventario

Aplicacion movil sencilla de inventario creada con React Native y Expo. No incluye inicio de sesion.

## Requisitos

- Node.js LTS
- npm
- Expo Go en el telefono, o un emulador Android

## Empezar

```bash
npm install
npm start
```

Escanea el codigo QR con Expo Go o usa `npm run android` con un emulador Android configurado.

## Base de datos

El esquema PostgreSQL esta en [`database/schema.sql`](./database/schema.sql). El backend en `backend/` consulta los productos de la base `inventario` y la aplicacion los carga desde la API.

## Iniciar la API

Configura las credenciales locales en `backend/.env` y ejecuta:

```bash
npm run backend
```

La configuracion inicial asume PostgreSQL en `localhost:5432`, usuario `postgres` y base `inventario`. Confirma la conexion en `http://localhost:3001/api/health`.

Para iniciar Expo en otra terminal:

```bash
npm start
```

La app movil consulta los productos y la tasa de cambio por medio de la API; nunca conectes React Native directamente a PostgreSQL ni guardes sus credenciales en la app. Para Expo Go en un telefono fisico, configura `.env` en la raiz con `EXPO_PUBLIC_API_URL=http://IP_DE_TU_COMPUTADORA:3001/api` (en esta computadora, la IP detectada es `192.168.1.10`) y reinicia Expo para que cargue la variable. Telefono y computadora deben estar en la misma Wi-Fi; permite el puerto 3001 en el firewall si Windows lo bloquea. En el emulador Android usa `EXPO_PUBLIC_API_URL=http://10.0.2.2:3001/api`. La conversion usa la fila mas reciente de `cambio`: pesos / `cambio_bs` para bolivares y pesos / `cambio_dolares` para dolares. Consulta [backend/README.md](./backend/README.md) para mas detalles.

El menu flotante incluye el acceso a **Cambiar tipo de cambio**, protegido temporalmente con la clave `12345`. La clave se configura en `backend/.env`; el servidor valida y guarda las tasas en PostgreSQL.

El mismo menu permite **Agregar producto** con descripcion, cantidad y precio en COP. El backend valida los datos y los inserta en `productos`; el nuevo producto queda disponible de inmediato en el buscador de ventas.

Al tocar **Confirmar venta**, selecciona si el cliente pago en pesos colombianos (COP), bolivares (VES) o dolares (USD). La venta y sus detalles se guardan en la tabla `ventas` y `detalle_ventas` con los importes en la moneda elegida y el precio vigente al vender. En **Confirmar ventas** puedes revisar el cobro y la moneda; confirmarla valida existencias, descuenta el inventario y cambia `confirmada` a `TRUE` en una sola transaccion. **Anular venta** elimina una venta pendiente y pide la clave `12345`; una venta ya confirmada no se puede anular desde esta pantalla.

En **Historial de ventas** puedes consultar el detalle, la moneda, el total y el estado (confirmada o pendiente) de cada venta. Por la limpieza automática, se conservan únicamente ventas de hasta un mes.

Desde **Agregar producto** puedes abrir **Ver inventario** para revisar, editar o eliminar productos. Editar y eliminar solicitan la clave `12345`; los productos que ya tienen detalles en el historial de ventas no se pueden eliminar, para conservar ese historial.

Para regresar de una pantalla, usa el gesto de volver desde el borde izquierdo del celular o el boton/gesto Atrás de Android. En las pantallas secundarias, Atrás vuelve a la pantalla anterior de la app en lugar de cerrarla.

El backend elimina automáticamente, al iniciar y luego cada 24 horas, las ventas con un mes o más de antigüedad, incluidas las confirmadas. También se eliminan sus detalles de venta; esta eliminación es permanente. El backend debe estar activo para ejecutar la limpieza programada.
