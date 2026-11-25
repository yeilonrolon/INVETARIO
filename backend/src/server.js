import cors from 'cors';
import express from 'express';
import { pool } from './db.js';

const app = express();
const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? '0.0.0.0';

app.use(cors());
app.use(express.json());

function hasValidRatePassword(password) {
  const configuredPassword = process.env.RATE_SETTINGS_PASSWORD;
  return (
    typeof password === 'string' &&
    typeof configuredPassword === 'string' &&
    configuredPassword.length > 0 &&
    password === configuredPassword
  );
}

function hasValidCancellationPassword(password) {
  const configuredPassword = process.env.SALE_CANCEL_PASSWORD;
  return (
    typeof password === 'string' &&
    typeof configuredPassword === 'string' &&
    configuredPassword.length > 0 &&
    password === configuredPassword
  );
}

function hasValidInventoryPassword(password) {
  const configuredPassword = process.env.INVENTORY_MANAGEMENT_PASSWORD;
  return (
    typeof password === 'string' &&
    typeof configuredPassword === 'string' &&
    configuredPassword.length > 0 &&
    password === configuredPassword
  );
}

function validateProductInput(body) {
  const descripcion =
    typeof body?.descripcion === 'string' ? body.descripcion.trim() : '';
  const { cantidad, precio_pesos: precioPesos } = body ?? {};

  if (
    !descripcion ||
    !Number.isInteger(cantidad) ||
    cantidad < 0 ||
    typeof precioPesos !== 'number' ||
    !Number.isFinite(precioPesos) ||
    precioPesos < 0
  ) {
    return null;
  }

  return { descripcion, cantidad, precioPesos };
}

function requireInventoryPassword(request, response) {
  if (!process.env.INVENTORY_MANAGEMENT_PASSWORD) {
    response.status(503).json({
      message: 'La clave de inventario no esta configurada en el backend.',
    });
    return false;
  }

  if (!hasValidInventoryPassword(request.body?.password)) {
    response.status(401).json({
      message: 'La clave de confirmacion no es correcta.',
    });
    return false;
  }

  return true;
}

app.post('/api/exchange-rate/access', (request, response) => {
  if (!process.env.RATE_SETTINGS_PASSWORD) {
    response.status(503).json({
      message: 'La clave de tasas no esta configurada en el backend.',
    });
    return;
  }

  if (!hasValidRatePassword(request.body?.password)) {
    response.status(401).json({ message: 'La clave ingresada no es correcta.' });
    return;
  }

  response.json({ access: 'granted' });
});

app.get('/api/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    console.error('No se pudo verificar la conexión con PostgreSQL:', error);
    response.status(503).json({
      status: 'error',
      message: 'No se pudo conectar con PostgreSQL.',
    });
  }
});

app.get('/api/products', async (_request, response) => {
  try {
    const result = await pool.query(
      `SELECT id, descripcion, cantidad, precio_pesos
       FROM productos
       ORDER BY descripcion ASC`,
    );

    response.json(
      result.rows.map((product) => ({
        ...product,
        precio_pesos: Number(product.precio_pesos),
      })),
    );
  } catch (error) {
    console.error('No se pudieron consultar los productos:', error);
    response.status(500).json({
      message: 'No se pudieron cargar los productos desde PostgreSQL.',
    });
  }
});

app.post('/api/products/access', (request, response) => {
  if (!process.env.INVENTORY_MANAGEMENT_PASSWORD) {
    response.status(503).json({
      message: 'La clave de inventario no esta configurada en el backend.',
    });
    return;
  }

  if (!hasValidInventoryPassword(request.body?.password)) {
    response.status(401).json({
      message: 'La clave de confirmacion no es correcta.',
    });
    return;
  }

  response.json({ access: 'granted' });
});

app.post('/api/products', async (request, response) => {
  const product = validateProductInput(request.body);
  if (!product) {
    response.status(400).json({
      message:
        'La descripcion es obligatoria; cantidad debe ser un entero no negativo y el precio debe ser un numero no negativo.',
    });
    return;
  }

  try {
    const result = await pool.query(
      `INSERT INTO productos (descripcion, cantidad, precio_pesos)
       VALUES ($1, $2, $3)
       RETURNING id, descripcion, cantidad, precio_pesos`,
      [product.descripcion, product.cantidad, product.precioPesos],
    );
    const createdProduct = result.rows[0];

    response.status(201).json({
      ...createdProduct,
      precio_pesos: Number(createdProduct.precio_pesos),
    });
  } catch (error) {
    console.error('No se pudo registrar el producto:', error);
    response.status(500).json({
      message: 'No se pudo guardar el producto en PostgreSQL.',
    });
  }
});

app.put('/api/products/:id', async (request, response) => {
  if (!requireInventoryPassword(request, response)) return;

  const productId = Number(request.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    response.status(400).json({ message: 'El identificador del producto no es valido.' });
    return;
  }

  const product = validateProductInput(request.body);
  if (!product) {
    response.status(400).json({
      message:
        'La descripcion es obligatoria; cantidad debe ser un entero no negativo y el precio debe ser un numero no negativo.',
    });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE productos
       SET descripcion = $1, cantidad = $2, precio_pesos = $3
       WHERE id = $4
       RETURNING id, descripcion, cantidad, precio_pesos`,
      [product.descripcion, product.cantidad, product.precioPesos, productId],
    );

    if (result.rowCount === 0) {
      response.status(404).json({ message: 'El producto no existe.' });
      return;
    }

    const updatedProduct = result.rows[0];
    response.json({
      ...updatedProduct,
      precio_pesos: Number(updatedProduct.precio_pesos),
    });
  } catch (error) {
    console.error('No se pudo actualizar el producto:', error);
    response.status(500).json({
      message: 'No se pudo actualizar el producto en PostgreSQL.',
    });
  }
});

app.delete('/api/products/:id', async (request, response) => {
  if (!requireInventoryPassword(request, response)) return;

  const productId = Number(request.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    response.status(400).json({ message: 'El identificador del producto no es valido.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const productResult = await client.query(
      'SELECT id FROM productos WHERE id = $1 FOR UPDATE',
      [productId],
    );

    if (productResult.rowCount === 0) {
      await client.query('ROLLBACK');
      response.status(404).json({ message: 'El producto no existe.' });
      return;
    }

    const salesDetailResult = await client.query(
      'SELECT 1 FROM detalle_ventas WHERE producto_id = $1 LIMIT 1',
      [productId],
    );
    if (salesDetailResult.rowCount > 0) {
      await client.query('ROLLBACK');
      response.status(409).json({
        message:
          'No se puede eliminar este producto porque forma parte del historial de ventas. Puedes editarlo o dejar su cantidad en cero.',
      });
      return;
    }

    await client.query('DELETE FROM productos WHERE id = $1', [productId]);
    await client.query('COMMIT');
    response.json({ id: productId, eliminado: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('No se pudo eliminar el producto:', error);
    response.status(500).json({
      message: 'No se pudo eliminar el producto de PostgreSQL.',
    });
  } finally {
    client.release();
  }
});

app.post('/api/sales', async (request, response) => {
  const { moneda, items } = request.body ?? {};
  if (
    !['COP', 'USD', 'VES'].includes(moneda) ||
    !Array.isArray(items) ||
    items.length === 0 ||
    !items.every(
      (item) =>
        item &&
        Number.isInteger(item.producto_id) &&
        item.producto_id > 0 &&
        Number.isInteger(item.cantidad) &&
        item.cantidad > 0,
    )
  ) {
    response.status(400).json({
      message: 'La venta requiere una moneda valida y al menos un detalle valido.',
    });
    return;
  }

  const uniqueProductIds = new Set(items.map((item) => item.producto_id));
  if (uniqueProductIds.size !== items.length) {
    response.status(400).json({
      message: 'Cada producto debe aparecer una sola vez en la venta.',
    });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const productIds = items.map((item) => item.producto_id);
    const productResult = await client.query(
      `SELECT id, descripcion, precio_pesos
       FROM productos
       WHERE id = ANY($1::integer[])
       ORDER BY id
       FOR SHARE`,
      [productIds],
    );

    if (productResult.rowCount !== items.length) {
      await client.query('ROLLBACK');
      response.status(404).json({
        message: 'Uno o mas productos de la venta ya no existen.',
      });
      return;
    }

    const exchangeRateResult = await client.query(
      `SELECT cambio_bs, cambio_dolares
       FROM cambio
       ORDER BY id DESC
       LIMIT 1
       FOR SHARE`,
    );
    if (
      moneda !== 'COP' &&
      (exchangeRateResult.rowCount === 0 ||
        Number(exchangeRateResult.rows[0].cambio_bs) <= 0 ||
        Number(exchangeRateResult.rows[0].cambio_dolares) <= 0)
    ) {
      await client.query('ROLLBACK');
      response.status(409).json({
        message:
          'Registra tasas de cambio mayores que cero antes de vender en Bs. o USD.',
      });
      return;
    }

    const exchangeRate = exchangeRateResult.rows[0];
    const decimals = moneda === 'USD' ? 1 : moneda === 'VES' ? 2 : 0;
    const multiplier = 10 ** decimals;
    const convertUnitPrice = (priceInPesos) => {
      let amount = Number(priceInPesos);
      if (moneda === 'VES') {
        amount /= Number(exchangeRate.cambio_bs);
      } else if (moneda === 'USD') {
        amount /= Number(exchangeRate.cambio_dolares);
      }
      return Math.round((amount + Number.EPSILON) * multiplier) / multiplier;
    };

    const productsById = new Map(
      productResult.rows.map((product) => [product.id, product]),
    );
    const saleResult = await client.query(
      `INSERT INTO ventas (moneda, monto_total, confirmada)
       VALUES ($1, 0, FALSE)
       RETURNING id, fecha, moneda, monto_total`,
      [moneda],
    );
    const sale = saleResult.rows[0];

    for (const item of items) {
      const product = productsById.get(item.producto_id);
      const unitPrice = convertUnitPrice(product.precio_pesos);
      await client.query(
        `INSERT INTO detalle_ventas
           (venta_id, producto_id, cantidad, precio_unitario)
         VALUES ($1, $2, $3, $4)`,
        [sale.id, item.producto_id, item.cantidad, unitPrice],
      );
    }

    const totalResult = await client.query(
      `UPDATE ventas
       SET monto_total = (
         SELECT COALESCE(SUM(cantidad * precio_unitario), 0)
         FROM detalle_ventas
         WHERE venta_id = $1
       )
       WHERE id = $1
       RETURNING monto_total`,
      [sale.id],
    );

    await client.query('COMMIT');
    response.status(201).json({
      id: sale.id,
      fecha: sale.fecha,
      moneda: sale.moneda,
      monto_total: Number(totalResult.rows[0].monto_total),
      items: items.map((item) => {
        const product = productsById.get(item.producto_id);
        return {
          producto_id: item.producto_id,
          descripcion: product.descripcion,
          cantidad: item.cantidad,
          precio_unitario: convertUnitPrice(product.precio_pesos),
        };
      }),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('No se pudo registrar la venta pendiente:', error);
    response.status(500).json({
      message: 'No se pudo registrar la venta pendiente en PostgreSQL.',
    });
  } finally {
    client.release();
  }
});

app.get('/api/sales/pending', async (_request, response) => {
  try {
    const salesResult = await pool.query(
      `SELECT id, fecha, moneda, monto_total
       FROM ventas
       WHERE confirmada = FALSE
       ORDER BY fecha ASC, id ASC`,
    );

    if (salesResult.rowCount === 0) {
      response.json([]);
      return;
    }

    const saleIds = salesResult.rows.map((sale) => sale.id);
    const detailsResult = await pool.query(
      `SELECT dv.venta_id, dv.producto_id, p.descripcion,
              dv.cantidad, dv.precio_unitario
       FROM detalle_ventas dv
       JOIN productos p ON p.id = dv.producto_id
       WHERE dv.venta_id = ANY($1::integer[])
       ORDER BY dv.venta_id, dv.id`,
      [saleIds],
    );
    const detailsBySale = new Map(saleIds.map((id) => [id, []]));

    for (const detail of detailsResult.rows) {
      detailsBySale.get(detail.venta_id).push({
        producto_id: detail.producto_id,
        descripcion: detail.descripcion,
        cantidad: detail.cantidad,
        precio_unitario: Number(detail.precio_unitario),
      });
    }

    response.json(
      salesResult.rows.map((sale) => ({
        id: sale.id,
        fecha: sale.fecha,
        moneda: sale.moneda,
        monto_total: Number(sale.monto_total),
        items: detailsBySale.get(sale.id),
      })),
    );
  } catch (error) {
    console.error('No se pudieron consultar las ventas pendientes:', error);
    response.status(500).json({
      message: 'No se pudieron cargar las ventas pendientes.',
    });
  }
});

app.get('/api/sales/history', async (_request, response) => {
  try {
    const salesResult = await pool.query(
      `SELECT id, fecha, moneda, monto_total, confirmada
       FROM ventas
       ORDER BY fecha DESC, id DESC`,
    );

    if (salesResult.rowCount === 0) {
      response.json([]);
      return;
    }

    const saleIds = salesResult.rows.map((sale) => sale.id);
    const detailsResult = await pool.query(
      `SELECT dv.venta_id, dv.producto_id, p.descripcion,
              dv.cantidad, dv.precio_unitario
       FROM detalle_ventas dv
       JOIN productos p ON p.id = dv.producto_id
       WHERE dv.venta_id = ANY($1::integer[])
       ORDER BY dv.venta_id, dv.id`,
      [saleIds],
    );
    const detailsBySale = new Map(saleIds.map((id) => [id, []]));

    for (const detail of detailsResult.rows) {
      detailsBySale.get(detail.venta_id).push({
        producto_id: detail.producto_id,
        descripcion: detail.descripcion,
        cantidad: detail.cantidad,
        precio_unitario: Number(detail.precio_unitario),
      });
    }

    response.json(
      salesResult.rows.map((sale) => ({
        id: sale.id,
        fecha: sale.fecha,
        moneda: sale.moneda,
        monto_total: Number(sale.monto_total),
        confirmada: sale.confirmada,
        items: detailsBySale.get(sale.id),
      })),
    );
  } catch (error) {
    console.error('No se pudo consultar el historial de ventas:', error);
    response.status(500).json({
      message: 'No se pudo cargar el historial de ventas.',
    });
  }
});

app.post('/api/sales/:id/confirm', async (request, response) => {
  const saleId = Number(request.params.id);
  if (!Number.isInteger(saleId) || saleId <= 0) {
    response.status(400).json({ message: 'El identificador de venta no es valido.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const saleResult = await client.query(
      'SELECT id, confirmada FROM ventas WHERE id = $1 FOR UPDATE',
      [saleId],
    );
    if (saleResult.rowCount === 0) {
      await client.query('ROLLBACK');
      response.status(404).json({ message: 'La venta no existe.' });
      return;
    }
    if (saleResult.rows[0].confirmada) {
      await client.query('ROLLBACK');
      response.status(409).json({ message: 'La venta ya fue confirmada.' });
      return;
    }

    const detailsResult = await client.query(
      `SELECT dv.producto_id, dv.cantidad, p.descripcion, p.cantidad AS stock
       FROM detalle_ventas dv
       JOIN productos p ON p.id = dv.producto_id
       WHERE dv.venta_id = $1
       ORDER BY p.id
       FOR UPDATE OF p`,
      [saleId],
    );

    if (detailsResult.rowCount === 0) {
      await client.query('ROLLBACK');
      response.status(409).json({
        message: 'La venta no tiene productos y no se puede confirmar.',
      });
      return;
    }

    const insufficientStock = detailsResult.rows.find(
      (detail) => detail.stock < detail.cantidad,
    );
    if (insufficientStock) {
      await client.query('ROLLBACK');
      response.status(409).json({
        message: `Existencias insuficientes para "${insufficientStock.descripcion}". Disponibles: ${insufficientStock.stock}; solicitadas: ${insufficientStock.cantidad}.`,
      });
      return;
    }

    for (const detail of detailsResult.rows) {
      await client.query(
        'UPDATE productos SET cantidad = cantidad - $1 WHERE id = $2',
        [detail.cantidad, detail.producto_id],
      );
    }
    await client.query(
      'UPDATE ventas SET confirmada = TRUE WHERE id = $1',
      [saleId],
    );
    await client.query('COMMIT');
    response.json({ id: saleId, confirmada: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('No se pudo confirmar la venta:', error);
    response.status(500).json({
      message: 'No se pudo confirmar la venta ni actualizar el inventario.',
    });
  } finally {
    client.release();
  }
});

app.post('/api/sales/:id/cancel', async (request, response) => {
  const saleId = Number(request.params.id);
  if (!Number.isInteger(saleId) || saleId <= 0) {
    response.status(400).json({ message: 'El identificador de venta no es valido.' });
    return;
  }
  if (!process.env.SALE_CANCEL_PASSWORD) {
    response.status(503).json({
      message: 'La clave para anular ventas no esta configurada en el backend.',
    });
    return;
  }
  if (!hasValidCancellationPassword(request.body?.password)) {
    response.status(401).json({ message: 'La clave de anulacion no es correcta.' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const saleResult = await client.query(
      'SELECT id, confirmada FROM ventas WHERE id = $1 FOR UPDATE',
      [saleId],
    );
    if (saleResult.rowCount === 0) {
      await client.query('ROLLBACK');
      response.status(404).json({ message: 'La venta no existe.' });
      return;
    }
    if (saleResult.rows[0].confirmada) {
      await client.query('ROLLBACK');
      response.status(409).json({
        message: 'No se puede anular una venta que ya fue confirmada.',
      });
      return;
    }

    await client.query('DELETE FROM ventas WHERE id = $1', [saleId]);
    await client.query('COMMIT');
    response.json({ id: saleId, anulada: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('No se pudo anular la venta pendiente:', error);
    response.status(500).json({
      message: 'No se pudo anular la venta.',
    });
  } finally {
    client.release();
  }
});

app.get('/api/exchange-rate', async (_request, response) => {
  try {
    const result = await pool.query(
      `SELECT cambio_bs, cambio_dolares
       FROM cambio
       ORDER BY id DESC
       LIMIT 1`,
    );

    if (result.rowCount === 0) {
      response.status(404).json({
        message: 'No hay tasas registradas en la tabla cambio.',
      });
      return;
    }

    const exchangeRate = {
      cambio_bs: Number(result.rows[0].cambio_bs),
      cambio_dolares: Number(result.rows[0].cambio_dolares),
    };

    if (
      !Number.isFinite(exchangeRate.cambio_bs) ||
      exchangeRate.cambio_bs <= 0 ||
      !Number.isFinite(exchangeRate.cambio_dolares) ||
      exchangeRate.cambio_dolares <= 0
    ) {
      response.status(422).json({
        message: 'Las tasas en la tabla cambio deben ser mayores que cero.',
      });
      return;
    }

    response.json(exchangeRate);
  } catch (error) {
    console.error('No se pudieron consultar las tasas de cambio:', error);
    response.status(500).json({
      message: 'No se pudieron cargar las tasas desde PostgreSQL.',
    });
  }
});

app.put('/api/exchange-rate', async (request, response) => {
  if (!process.env.RATE_SETTINGS_PASSWORD) {
    response.status(503).json({
      message: 'La clave de tasas no esta configurada en el backend.',
    });
    return;
  }

  if (!hasValidRatePassword(request.body?.password)) {
    response.status(401).json({ message: 'La clave ingresada no es correcta.' });
    return;
  }

  const { cambio_bs: cambioBs, cambio_dolares: cambioDolares } = request.body;
  if (
    typeof cambioBs !== 'number' ||
    !Number.isFinite(cambioBs) ||
    cambioBs <= 0 ||
    typeof cambioDolares !== 'number' ||
    !Number.isFinite(cambioDolares) ||
    cambioDolares <= 0
  ) {
    response.status(400).json({
      message: 'Las tasas deben ser numeros mayores que cero.',
    });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE cambio
       SET cambio_bs = $1, cambio_dolares = $2
       WHERE id = (SELECT id FROM cambio ORDER BY id DESC LIMIT 1)
       RETURNING cambio_bs, cambio_dolares`,
      [cambioBs, cambioDolares],
    );

    if (result.rowCount === 0) {
      response.status(404).json({
        message: 'No hay una fila en la tabla cambio para actualizar.',
      });
      return;
    }

    response.json({
      cambio_bs: Number(result.rows[0].cambio_bs),
      cambio_dolares: Number(result.rows[0].cambio_dolares),
    });
  } catch (error) {
    console.error('No se pudieron actualizar las tasas de cambio:', error);
    response.status(500).json({
      message: 'No se pudieron guardar las tasas en PostgreSQL.',
    });
  }
});

let salesCleanupRunning = false;

async function deleteExpiredSales() {
  if (salesCleanupRunning) return;
  salesCleanupRunning = true;

  try {
    const result = await pool.query(
      `DELETE FROM ventas
       WHERE fecha <= NOW() - INTERVAL '1 month'
       RETURNING id`,
    );
    if (result.rowCount > 0) {
      console.log(
        `Limpieza automatica: se eliminaron ${result.rowCount} ventas con mas de un mes y sus detalles.`,
      );
    }
  } catch (error) {
    console.error('No se pudieron eliminar las ventas con mas de un mes:', error);
  } finally {
    salesCleanupRunning = false;
  }
}

const salesCleanupInterval = setInterval(
  () => void deleteExpiredSales(),
  24 * 60 * 60 * 1000,
);

const server = app.listen(port, host, () => {
  console.log(`API disponible en http://localhost:${port}`);
  void deleteExpiredSales();
});

async function shutdown() {
  clearInterval(salesCleanupInterval);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
