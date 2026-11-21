"use client";

import type { SiteChromeSlots } from "@/components/SiteChrome";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import SafeImage from "@/components/SafeImage";
import { readOrderSummary, type OrderSummary } from "@/lib/orderSummary";

const SECONDARY = "#FE7A0D";
const PRIMARY = "#1A7D36";
const taka = (value: number) => `৳${Math.round(value).toLocaleString("en-US")}`;

function getStoredInvoiceId(): string {
  if (typeof window === "undefined") return "";
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem("kafela_pending_reconfirm_order") || "{}",
    );
    return parsed?.invoiceId || "";
  } catch {
    return "";
  }
}

function OrderSuccessContent({ header, footer }: SiteChromeSlots) {
  const params = useSearchParams();
  const [invoiceId, setInvoiceId] = useState("");
  const [summary, setSummary] = useState<OrderSummary | null>(null);

  useEffect(() => {
    const id = params.get("invoiceId") || getStoredInvoiceId();
    setInvoiceId(id);
    setSummary(readOrderSummary(id));
  }, [params]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#FFF9F3",
      }}
    >
      {header}
      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 16px",
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: "clamp(28px, 6vw, 48px) clamp(16px, 5vw, 40px)",
            textAlign: "center",
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            maxWidth: summary ? 560 : 460,
            width: "100%",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "#22c55e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <svg
              width="36"
              height="36"
              fill="none"
              stroke="#fff"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h2
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: "#111",
              margin: "0 0 8px",
            }}
          >
            আপনার order সফল হয়েছে 🎉
          </h2>
          <p style={{ fontSize: 14, color: "#666", margin: "0 0 28px" }}>
            আমরা শীঘ্রই আপনার সাথে যোগাযোগ করব।
          </p>

          {invoiceId && (
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "14px 20px",
                marginBottom: 28,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "#64748b",
                  marginBottom: 4,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                Invoice ID
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#111827" }}>
                {invoiceId}
              </div>
            </div>
          )}

          {summary && <OrderDetails summary={summary} />}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Link
              href="/track-order"
              style={{
                display: "block",
                background: SECONDARY,
                color: "#fff",
                padding: "13px 0",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              Order Track করুন
            </Link>
            <Link
              href="/"
              style={{
                display: "block",
                background: "#f3f4f6",
                color: "#374151",
                padding: "13px 0",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              হোমে ফিরুন
            </Link>
          </div>
        </div>
      </main>
      {footer}
    </div>
  );
}

const sectionTitle = {
  fontSize: 12,
  fontWeight: 800,
  color: "#64748b",
  textTransform: "uppercase" as const,
  letterSpacing: 0.8,
  margin: "0 0 10px",
};

function Row({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: strong ? 16 : 14, fontWeight: strong ? 800 : 500, color: color || (strong ? "#111827" : "#4b5563") }}>
      <span>{label}</span>
      <span style={{ whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

const formatPlacedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

function OrderDetails({ summary }: { summary: OrderSummary }) {
  const totalQty = summary.items.reduce((sum, item) => sum + item.qty, 0);
  const info: [string, string][] = [
    ["Invoice ID", summary.invoiceId],
    ["তারিখ ও সময়", formatPlacedAt(summary.placedAt)],
    ["নাম", summary.name],
    ["মোবাইল", summary.phone],
    ["ঠিকানা", summary.address],
    ["ডেলিভারি এরিয়া", summary.deliveryArea],
    ["পেমেন্ট", summary.paymentMethod],
    ["নোট", summary.note],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <div style={{ textAlign: "left", marginBottom: 28, border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
      {/* Order and customer info */}
      <div style={{ padding: "14px 16px" }}>
        <p style={sectionTitle}>অর্ডার তথ্য</p>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 14, rowGap: 7, fontSize: 14 }}>
          {info.map(([label, value]) => (
            <div key={label} style={{ display: "contents" }}>
              <span style={{ color: "#6b7280", whiteSpace: "nowrap" }}>{label}</span>
              <span style={{ color: "#111827", fontWeight: 600, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Products with quantity */}
      <div style={{ borderTop: "1px solid #e5e7eb", padding: "14px 16px 6px" }}>
        <p style={sectionTitle}>অর্ডারকৃত পণ্য ({summary.items.length} টি · মোট {totalQty} পিস)</p>
        {summary.items.map((item, index) => (
          <div
            key={`${item.name}-${index}`}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: index ? "1px dashed #e5e7eb" : "none" }}
          >
            <SafeImage
              sources={[item.image]}
              alt={item.name}
              width={48}
              height={48}
              style={{ objectFit: "cover", borderRadius: 8, flexShrink: 0, background: "#f3f4f6" }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827", lineHeight: "19px" }}>{item.name}</p>
              {item.variant && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>{item.variant}</p>}
              <p style={{ margin: "3px 0 0", fontSize: 12, color: "#4b5563" }}>
                পরিমাণ: <b style={{ color: "#111827" }}>{item.qty}</b> × {taka(item.price)}
              </p>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }}>{taka(item.price * item.qty)}</span>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div style={{ background: "#f8fafc", borderTop: "1px solid #e5e7eb", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        <Row label="সাবটোটাল" value={taka(summary.subtotal)} />
        <Row label="ডেলিভারি চার্জ" value={summary.deliveryCharge > 0 ? taka(summary.deliveryCharge) : "ফ্রি"} />
        {summary.discount > 0 && <Row label="ডিসকাউন্ট" value={`− ${taka(summary.discount)}`} color={PRIMARY} />}
        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10, marginTop: 2 }}>
          <Row label="সর্বমোট" value={taka(summary.total)} strong color={SECONDARY} />
        </div>
      </div>
    </div>
  );
}

export default function OrderSuccessPage(props: SiteChromeSlots) {
  return (
    <Suspense>
      <OrderSuccessContent {...props} />
    </Suspense>
  );
}
