// Snapshot of a just-placed order, shown on the order-success page.
// Lives in sessionStorage (this tab only) and is matched by invoice ID.

const KEY = "dfh_last_order_summary";

export interface OrderSummaryItem {
  name: string;
  image?: string;
  variant?: string;
  price: number;
  qty: number;
}

export interface OrderSummary {
  invoiceId: string;
  /** ISO time the order was placed */
  placedAt: string;
  name: string;
  phone: string;
  address: string;
  deliveryArea: string;
  paymentMethod: string;
  note: string;
  items: OrderSummaryItem[];
  subtotal: number;
  deliveryCharge: number;
  discount: number;
  total: number;
}

export function saveOrderSummary(summary: OrderSummary) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(summary));
  } catch {
    // Storage blocked (private mode): the page still shows the invoice ID.
  }
}

export function readOrderSummary(invoiceId: string): OrderSummary | null {
  try {
    const summary = JSON.parse(window.sessionStorage.getItem(KEY) || "null") as OrderSummary | null;
    if (!summary || !Array.isArray(summary.items)) return null;
    return !invoiceId || summary.invoiceId === invoiceId ? summary : null;
  } catch {
    return null;
  }
}
