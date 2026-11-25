import type { Product } from '../types/product';
import type { ExchangeRate } from '../types/exchange-rate';
import type {
  PendingSale,
  SaleHistoryRecord,
  SaleCurrency,
  SaleItemInput,
} from '../types/sale';

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001/api';

async function getApiData(path: string): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(`${apiUrl}/${path}`);
  } catch {
    throw new Error(
      `No se pudo acceder a ${apiUrl}. Verifica que el telefono y la computadora esten en la misma red Wi-Fi, que el backend este iniciado y que el firewall permita el puerto 3001.`,
    );
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
        ? body.message
        : `La API respondio con el estado ${response.status}.`;
    throw new Error(message);
  }

  return response.json();
}

export async function getProducts(): Promise<Product[]> {
  const data = await getApiData('products');
  if (
    !Array.isArray(data) ||
    !data.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        'id' in item &&
        typeof item.id === 'number' &&
        'descripcion' in item &&
        typeof item.descripcion === 'string' &&
        'cantidad' in item &&
        typeof item.cantidad === 'number' &&
        'precio_pesos' in item &&
        typeof item.precio_pesos === 'number',
    )
  ) {
    throw new Error('La API devolvio un formato de productos no valido.');
  }

  return data;
}

export async function getExchangeRate(): Promise<ExchangeRate> {
  const data = await getApiData('exchange-rate');
  if (
    typeof data !== 'object' ||
    data === null ||
    !('cambio_bs' in data) ||
    typeof data.cambio_bs !== 'number' ||
    !Number.isFinite(data.cambio_bs) ||
    data.cambio_bs <= 0 ||
    !('cambio_dolares' in data) ||
    typeof data.cambio_dolares !== 'number' ||
    !Number.isFinite(data.cambio_dolares) ||
    data.cambio_dolares <= 0
  ) {
    throw new Error(
      'La tasa de cambio debe tener valores mayores que cero para Bs. y USD.',
    );
  }

  return {
    cambio_bs: data.cambio_bs,
    cambio_dolares: data.cambio_dolares,
  };
}

async function sendRateRequest(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body: Record<string, unknown>,
): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(`${apiUrl}/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      `No se pudo acceder a ${apiUrl}. Verifica que el backend este iniciado.`,
    );
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof data.message === 'string'
        ? data.message
        : `La API respondio con el estado ${response.status}.`;
    throw new Error(message);
  }

  return data;
}

export async function verifyRatePassword(password: string): Promise<void> {
  await sendRateRequest('exchange-rate/access', 'POST', { password });
}

export async function updateExchangeRate(
  rate: ExchangeRate,
  password: string,
): Promise<ExchangeRate> {
  const data = await sendRateRequest('exchange-rate', 'PUT', {
    ...rate,
    password,
  });

  if (
    typeof data !== 'object' ||
    data === null ||
    !('cambio_bs' in data) ||
    typeof data.cambio_bs !== 'number' ||
    !('cambio_dolares' in data) ||
    typeof data.cambio_dolares !== 'number'
  ) {
    throw new Error('La API devolvio una tasa de cambio no valida.');
  }

  return {
    cambio_bs: data.cambio_bs,
    cambio_dolares: data.cambio_dolares,
  };
}

export async function createProduct(
  product: Omit<Product, 'id'>,
): Promise<Product> {
  const data = await sendRateRequest('products', 'POST', product);

  if (
    typeof data !== 'object' ||
    data === null ||
    !('id' in data) ||
    typeof data.id !== 'number' ||
    !('descripcion' in data) ||
    typeof data.descripcion !== 'string' ||
    !('cantidad' in data) ||
    typeof data.cantidad !== 'number' ||
    !('precio_pesos' in data) ||
    typeof data.precio_pesos !== 'number'
  ) {
    throw new Error('La API devolvio un producto no valido.');
  }

  return {
    id: data.id,
    descripcion: data.descripcion,
    cantidad: data.cantidad,
    precio_pesos: data.precio_pesos,
  };
}

export async function verifyInventoryPassword(password: string): Promise<void> {
  await sendRateRequest('products/access', 'POST', { password });
}

export async function updateProduct(
  productId: number,
  product: Omit<Product, 'id'>,
  password: string,
): Promise<Product> {
  const data = await sendRateRequest(`products/${productId}`, 'PUT', {
    ...product,
    password,
  });

  if (
    typeof data !== 'object' ||
    data === null ||
    !('id' in data) ||
    typeof data.id !== 'number' ||
    !('descripcion' in data) ||
    typeof data.descripcion !== 'string' ||
    !('cantidad' in data) ||
    typeof data.cantidad !== 'number' ||
    !('precio_pesos' in data) ||
    typeof data.precio_pesos !== 'number'
  ) {
    throw new Error('La API devolvio un producto no valido.');
  }

  return {
    id: data.id,
    descripcion: data.descripcion,
    cantidad: data.cantidad,
    precio_pesos: data.precio_pesos,
  };
}

export async function deleteProduct(
  productId: number,
  password: string,
): Promise<void> {
  await sendRateRequest(`products/${productId}`, 'DELETE', { password });
}

function isPendingSale(value: unknown): value is PendingSale {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'number' &&
    'fecha' in value &&
    typeof value.fecha === 'string' &&
    'moneda' in value &&
    (value.moneda === 'COP' || value.moneda === 'USD' || value.moneda === 'VES') &&
    'monto_total' in value &&
    typeof value.monto_total === 'number' &&
    'items' in value &&
    Array.isArray(value.items) &&
    value.items.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        'producto_id' in item &&
        typeof item.producto_id === 'number' &&
        'descripcion' in item &&
        typeof item.descripcion === 'string' &&
        'cantidad' in item &&
        typeof item.cantidad === 'number' &&
        'precio_unitario' in item &&
        typeof item.precio_unitario === 'number',
    )
  );
}

function isSaleHistoryRecord(value: unknown): value is SaleHistoryRecord {
  return (
    isPendingSale(value) &&
    'confirmada' in value &&
    typeof value.confirmada === 'boolean'
  );
}

export async function createSale(
  items: SaleItemInput[],
  moneda: SaleCurrency,
): Promise<PendingSale> {
  const data = await sendRateRequest('sales', 'POST', {
    moneda,
    items,
  });

  if (!isPendingSale(data)) {
    throw new Error('La API devolvio una venta no valida.');
  }

  return data;
}

export async function getPendingSales(): Promise<PendingSale[]> {
  const data = await getApiData('sales/pending');
  if (!Array.isArray(data) || !data.every(isPendingSale)) {
    throw new Error('La API devolvio una lista de ventas no valida.');
  }
  return data;
}

export async function getSalesHistory(): Promise<SaleHistoryRecord[]> {
  const data = await getApiData('sales/history');
  if (!Array.isArray(data) || !data.every(isSaleHistoryRecord)) {
    throw new Error('La API devolvio un historial de ventas no valido.');
  }
  return data;
}

export async function confirmSale(saleId: number): Promise<void> {
  await sendRateRequest(`sales/${saleId}/confirm`, 'POST', {});
}

export async function cancelSale(
  saleId: number,
  password: string,
): Promise<void> {
  await sendRateRequest(`sales/${saleId}/cancel`, 'POST', { password });
}
