"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/context/CartContext";

const PRIMARY = "#1A7D36";
const PRIMARY_DARK = "#146A2D";
const SECONDARY = "#FE7A0D";

// Pages that already have their own order button, or where ordering is underway.
const HIDDEN_ON = ["/checkout", "/one-click-bazar", "/order-success", "/landing-page", "/re-confirm"];

// Phone-only "Place Order" bar joined to the top of the bottom tab bar while the cart has items.
// The white panel's bottom padding leaves room for the tab bar's raised middle button.
// Its height (--bottom-bar-h) is reserved in globals.css.
export default function MobileOrderBar() {
  const pathname = usePathname();
  const { totalItems, totalPrice, cartOpen, openCart } = useCart();

  if (totalItems <= 0 || cartOpen || HIDDEN_ON.some((path) => pathname.startsWith(path))) return null;

  return (
    <div
      className="mobile-order-bar md:hidden print:hidden fixed inset-x-0 z-[89] bg-white"
      style={{
        bottom: "var(--mobile-nav-h, 0px)",
        padding: "10px 12px 22px",
        borderTop: "1px solid #eee",
        boxShadow: "0 -6px 16px rgba(0,0,0,0.08)",
      }}
    >
      <div
        className="relative flex items-stretch overflow-hidden rounded-2xl text-white"
        style={{ height: 50, background: PRIMARY, boxShadow: "0 4px 12px rgba(26,125,54,0.35)" }}
      >
        {/* Bag with item count: opens the cart to review */}
        <button
          type="button"
          onClick={openCart}
          aria-label={`View cart (${totalItems} items)`}
          className="flex shrink-0 items-center justify-center"
          style={{ width: 58, background: PRIMARY_DARK }}
        >
          <span className="relative inline-flex">
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" />
            </svg>
            <span
              className="absolute flex items-center justify-center rounded-full font-bold leading-none text-white"
              style={{
                top: -7,
                right: -10,
                minWidth: 19,
                height: 19,
                padding: "0 5px",
                fontSize: 11,
                background: SECONDARY,
                border: `2px solid ${PRIMARY_DARK}`,
              }}
            >
              {totalItems > 99 ? "99+" : totalItems}
            </span>
          </span>
        </button>

        <Link
          href="/checkout"
          className="flex min-w-0 flex-1 items-center justify-end pr-1.5 text-white"
          style={{ textDecoration: "none" }}
        >
          {/* Centred on the whole bar; clicks pass through to this link */}
          <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 font-extrabold"
            style={{ fontSize: 16, letterSpacing: 0.2 }}
          >
            Place Order
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
          <span
            className="shrink-0 rounded-xl bg-white font-extrabold"
            style={{ color: PRIMARY, fontSize: 15, padding: "7px 12px" }}
          >
            ৳{totalPrice.toLocaleString("en-US")}
          </span>
        </Link>
      </div>
    </div>
  );
}
