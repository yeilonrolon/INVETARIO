export type SaleItemInput = {
  producto_id: number;
  cantidad: number;
};

export type SaleCurrency = 'COP' | 'USD' | 'VES';

export type SaleItem = SaleItemInput & {
  descripcion: string;
  precio_unitario: number;
};

export type PendingSale = {
  id: number;
  fecha: string;
  moneda: SaleCurrency;
  monto_total: number;
  items: SaleItem[];
};

export type SaleHistoryRecord = PendingSale & {
  confirmada: boolean;
};
