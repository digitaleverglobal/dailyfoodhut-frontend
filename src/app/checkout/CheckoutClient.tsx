"use client";
import type { SiteChromeSlots } from "@/components/SiteChrome";
import { useEffect, useRef, useState, Suspense } from "react";
import { useCheckoutSession } from "@/lib/useCheckoutSession";
import SafeImage from "@/components/SafeImage";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/CartContext";
import { createOrder, saveIncompleteOrder } from "@/services/orderService";
import { fetchSiteSettings, type SiteSetting } from "@/services/settingService";
import {
  fetchDeliveryCharges,
  getDeliveryChargeForDistrict,
  type ShippingCharge,
} from "@/services/shippingChargeService";
import {
  fetchDeliveryAreas,
  getDeliveryAreaCharge,
  type DeliveryArea,
} from "@/services/deliveryAreaService";
import { getPixelClickData, trackPixelEvent } from "@/lib/pixel";
import { saveOrderSummary } from "@/lib/orderSummary";
import { validateCoupon, type AppliedCoupon } from "@/services/couponService";
import { fetchProductById } from "@/services/productService";
import { variantLabel } from "@/lib/useVariantSelection";
import type { ProductVariant } from "@/data/products";
import {
  DEFAULT_DELIVERY_POLICY,
  getCouponErrorMessage,
  normalizePhoneNumber,
} from "@/lib/checkoutOptions";
import { useCustomer } from "@/context/CustomerContext";
import { fetchMyRewards, maxRedeemablePoints, type MyRewards } from "@/services/rewardService";

const fmt = (v: number) => v.toLocaleString("en-US");
const DEVICE_ID_KEY = "kafela_device_id";

function getCheckoutDeviceId() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  window.localStorage.setItem(DEVICE_ID_KEY, generated);
  return generated;
}


function CheckoutContent({ header, footer }: SiteChromeSlots) {
  const checkout = useCheckoutSession();
  const router = useRouter();
  const {
    items,
    removeFromCart,
    updateQty,
    changeVariant,
    clearCart,
    totalPrice,
  } = useCart();
  const [productVariants, setProductVariants] = useState<
    Record<number, ProductVariant[]>
  >({});
  const [productAreaIds, setProductAreaIds] = useState<
    Record<number, number[]>
  >({});

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [deliveryAreaId, setDeliveryAreaId] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [payment, setPayment] = useState<"bkash" | "nagad" | "rocket" | "cod">(
    "cod",
  );
  const { customer, token } = useCustomer();
  const [fetchedRewards, setFetchedRewards] = useState<MyRewards | null>(null);
  // Ignore a previous account's points after logging out.
  const rewards = token ? fetchedRewards : null;
  const [useRewardPoints, setUseRewardPoints] = useState(false);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    fetchMyRewards(token, controller.signal)
      .then(setFetchedRewards)
      .catch(() => setFetchedRewards(null));
    return () => controller.abort();
  }, [token]);
  const [coupon, setCoupon] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(
    null,
  );
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponMessage, setCouponMessage] = useState("");
  const [settings, setSettings] = useState<SiteSetting | null>(null);
  const [deliveryCharges, setDeliveryCharges] = useState<ShippingCharge[]>([]);
  const [deliveryAreas, setDeliveryAreas] = useState<DeliveryArea[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [incompleteOrderId, setIncompleteOrderId] = useState<number | null>(
    null,
  );
  const [deviceId, setDeviceId] = useState("");
  const beginCheckoutTrackedRef = useRef(false);
  const leadTrackedOrderIdRef = useRef<number | null>(null);

  const allItemsFreeShipping =
    items.length > 0 && items.every((item) => item.freeShipping === true);
  // Options are the active areas from admin → Website Setting → Delivery Area, limited to
  // the ones every cart product allows (a product with none set allows all).
  const areaOptions = items.reduce((areas, item) => {
    const allowed = productAreaIds[item.id];
    return allowed?.length
      ? areas.filter((area) => allowed.includes(Number(area.Id)))
      : areas;
  }, deliveryAreas);
  // A single allowed area is picked for the customer.
  const selectedArea =
    areaOptions.length === 1
      ? areaOptions[0]
      : areaOptions.find((area) => String(area.Id) === deliveryAreaId);
  // Without any delivery areas configured, the outside-Dhaka charge applies (as on the server).
  const regularDeliveryCharge = deliveryAreas.length
    ? getDeliveryAreaCharge(selectedArea)
    : getDeliveryChargeForDistrict(deliveryCharges, "outside");
  // Reward points and tier benefits apply only when ordering on the logged-in
  // account's own phone (the backend checks the same).
  const rewardPhoneMatches =
    !!customer && (!phone.trim() || normalizePhoneNumber(phone) === normalizePhoneNumber(customer.phone));
  const tierFreeDelivery =
    !!rewards?.settings.enabled && !!rewards.tier?.current.freeDelivery && rewardPhoneMatches;
  const freeDelivery = allItemsFreeShipping || tierFreeDelivery;
  const deliveryCharge = freeDelivery ? 0 : regularDeliveryCharge;
  const discount = appliedCoupon?.discount || 0;
  const redeemablePoints = rewards ? maxRedeemablePoints(rewards, totalPrice - discount) : 0;
  const redeemPoints = useRewardPoints && rewardPhoneMatches ? redeemablePoints : 0;
  const rewardDiscount = rewards ? redeemPoints * rewards.settings.pointValue : 0;
  const grandTotal = Math.max(0, totalPrice + deliveryCharge - discount - rewardDiscount);
  const paymentMethods = [
    {
      id: "cod" as const,
      label: "Cash on Delivery",
      number: null,
      bg: "#FE7A0D",
    },
    {
      id: "bkash" as const,
      label: "bKash",
      number: settings?.bkashNumber,
      bg: "#E2136E",
    },
    {
      id: "nagad" as const,
      label: "Nagad",
      number: settings?.nagadNumber,
      bg: "#F7941D",
    },
    {
      id: "rocket" as const,
      label: "Rocket",
      number: settings?.rocketNumber,
      bg: "#7A1FA2",
    },
  ].filter((method) => method.id === "cod" || method.number);

  useEffect(() => {
    Promise.all([
      fetchSiteSettings().catch(() => null),
      fetchDeliveryCharges().catch(() => []),
      fetchDeliveryAreas().catch(() => []),
    ]).then(([siteSettings, charges, areas]) => {
      setSettings(siteSettings);
      setDeliveryCharges(charges);
      setDeliveryAreas(areas);
    });
  }, []);

  useEffect(() => {
    setDeviceId(getCheckoutDeviceId());
  }, []);

  // Load each cart product's variants so the line's variant can be changed here.
  const productIdsKey = [
    ...new Set(items.filter((i) => !i.comboOfferId).map((i) => i.id)),
  ]
    .sort((a, b) => a - b)
    .join(",");
  useEffect(() => {
    const missing = productIdsKey
      .split(",")
      .filter(Boolean)
      .map(Number)
      .filter((id) => !(id in productVariants));
    if (missing.length === 0) return;
    let active = true;
    Promise.all(
      missing.map((id) =>
        fetchProductById(id)
          .catch(() => null)
          .then((product) => ({
            id,
            variants: product?.variants || [],
            areaIds: product?.deliveryAreaIds || [],
          })),
      ),
    ).then((entries) => {
      if (!active) return;
      setProductVariants((prev) => ({
        ...prev,
        ...Object.fromEntries(entries.map((e) => [e.id, e.variants])),
      }));
      setProductAreaIds((prev) => ({
        ...prev,
        ...Object.fromEntries(entries.map((e) => [e.id, e.areaIds])),
      }));
    });
    return () => {
      active = false;
    };
  }, [productIdsKey, productVariants]);

  useEffect(() => {
    if (beginCheckoutTrackedRef.current || items.length === 0) return;
    beginCheckoutTrackedRef.current = true;
    trackPixelEvent("InitiateCheckout", {
      content_ids: items.map((i) => i.id),
      content_name: "Checkout",
      content_type: "product",
      value: grandTotal,
      currency: "BDT",
      num_items: items.reduce((sum, item) => sum + item.qty, 0),
    });
  }, [grandTotal, items]);

  useEffect(() => {
    setAppliedCoupon(null);
    setCouponMessage("");
  }, [totalPrice]);

  useEffect(() => {
    const normalizedPhone = normalizePhoneNumber(phone);
    if (
      checkout.submitting.current ||
      items.length === 0 ||
      !/^01\d{9}$/.test(normalizedPhone)
    )
      return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (checkout.submitting.current) return;
      saveIncompleteOrder(
        {
          checkoutKey: checkout.getKey(normalizedPhone),
          incompleteOrderId: incompleteOrderId || undefined,
          deviceId,
          customerName: name.trim() || "Incomplete Customer",
          customerPhone: normalizedPhone,
          customerAddress: address.trim(),
          deliveryAreaId: selectedArea?.Id,
          customerNote: customerNote.trim() || undefined,
          paymentMethod: payment,
          items: items.map((i) => ({
            id: i.id,
            name: i.name,
            image: i.image,
            price: i.price,
            qty: i.qty,
            variantId: i.variantId,
            variant: i.variant,
            size: i.size,
            color: i.color,
            freeShipping: i.freeShipping,
            comboOfferId: i.comboOfferId,
          })),
          subtotal: totalPrice,
          deliveryCharge,
          discount,
          couponCode: appliedCoupon?.code || null,
          total: grandTotal,
          tracking: getPixelClickData(),
        },
        controller.signal,
      )
        .then((order) => {
          if (order?.Id) {
            setIncompleteOrderId(order.Id);
            if (leadTrackedOrderIdRef.current !== order.Id) {
              leadTrackedOrderIdRef.current = order.Id;
              trackPixelEvent(
                "Lead",
                {
                  content_ids: items.map((i) => i.id),
                  content_name: "Incomplete Checkout",
                  content_type: "product",
                  value: grandTotal,
                  currency: "BDT",
                  num_items: items.reduce((s, i) => s + i.qty, 0),
                },
                { name, phone: normalizedPhone },
              );
            }
          }
        })
        .catch(() => {});
    }, 700);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    address,
    customerNote,
    appliedCoupon?.code,
    deliveryCharge,
    discount,
    selectedArea?.Id,
    grandTotal,
    incompleteOrderId,
    items,
    name,
    payment,
    phone,
    deviceId,
    totalPrice,
  ]);

  const handleApplyCoupon = async () => {
    const code = coupon.trim();
    if (!code) {
      setCouponMessage("কুপন কোড লিখুন।");
      setAppliedCoupon(null);
      return;
    }
    setCouponLoading(true);
    setCouponMessage("");
    try {
      const result = await validateCoupon(code, totalPrice);
      setAppliedCoupon(result);
      setCouponMessage(`কুপন applied: ৳${fmt(result.discount)} discount`);
    } catch (error) {
      setAppliedCoupon(null);
      setCouponMessage(getCouponErrorMessage(error));
    } finally {
      setCouponLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (checkout.submitting.current) return;
    const normalizedPhone = normalizePhoneNumber(phone);
    if (!name || !phone || !address) {
      setErrorMsg("নাম, ফোন এবং ঠিকানা পূরণ করুন।");
      return;
    }
    if (deliveryAreas.length > 0 && areaOptions.length === 0) {
      setErrorMsg("কার্টের পণ্যগুলো একই এরিয়াতে ডেলিভারি হয় না। আলাদা অর্ডার করুন।");
      return;
    }
    if (deliveryAreas.length > 0 && !selectedArea) {
      setErrorMsg("ডেলিভারি এরিয়া নির্বাচন করুন।");
      return;
    }
    if (!/^01\d{9}$/.test(normalizedPhone)) {
      setErrorMsg("সঠিক ১১ সংখ্যার ফোন নাম্বার দিন।");
      return;
    }
    if (items.length === 0) {
      setErrorMsg("কোনো পণ্য নেই।");
      return;
    }
    checkout.submitting.current = true;
    setLoading(true);
    setErrorMsg("");
    try {
      const order = await createOrder({
        checkoutKey: checkout.getKey(normalizedPhone),
        incompleteOrderId: incompleteOrderId || undefined,
        deviceId,
        customerName: name,
        customerPhone: normalizedPhone,
        customerAddress: address,
        deliveryAreaId: selectedArea?.Id,
        customerNote: customerNote.trim() || undefined,
        paymentMethod: payment,
        items: items.map((i) => ({
          id: i.id,
          name: i.name,
          image: i.image,
          price: i.price,
          qty: i.qty,
          variantId: i.variantId,
          variant: i.variant,
          size: i.size,
          color: i.color,
          freeShipping: i.freeShipping,
          comboOfferId: i.comboOfferId,
        })),
        subtotal: totalPrice,
        deliveryCharge,
        discount,
        couponCode: appliedCoupon?.code || null,
        ...(redeemPoints > 0 ? { redeemPoints } : {}),
        total: grandTotal,
        tracking: getPixelClickData(),
      }, token);
      const orderPixelData = {
        content_ids: items.map((i) => i.id),
        content_type: "product",
        value: grandTotal,
        currency: "BDT",
        num_items: items.reduce((s, i) => s + i.qty, 0),
      };
      const orderPixelUser = { name, phone: normalizedPhone };
      trackPixelEvent(
        "AddPaymentInfo",
        { ...orderPixelData, content_name: "Checkout Payment Info" },
        orderPixelUser,
      );
      trackPixelEvent(
        "Purchase",
        {
          ...orderPixelData,
          content_name: "Order Confirmed",
          order_id: order.Id,
        },
        orderPixelUser,
      );
      window.localStorage.setItem(
        "kafela_pending_reconfirm_order",
        JSON.stringify({
          orderId: order.Id,
          invoiceId: order.invoiceId || order.orderId || "",
          phone: normalizedPhone,
          name,
          total: grandTotal,
        }),
      );
      // Shown on the order-success page. Kept in this tab only: invoice IDs are sequential,
      // so the page never fetches order details by invoice.
      const savedItems = order.items?.length ? order.items : items;
      const subtotal = Number(order.subtotal) || totalPrice;
      const delivery = Number.isFinite(Number(order.deliveryCharge)) ? Number(order.deliveryCharge) : deliveryCharge;
      const total = Number.isFinite(Number(order.total)) ? Number(order.total) : grandTotal;
      saveOrderSummary({
        invoiceId: order.invoiceId || order.orderId || "",
        placedAt: order.createdAt || new Date().toISOString(),
        name,
        phone: normalizedPhone,
        address,
        deliveryArea: selectedArea?.area || "",
        paymentMethod: paymentMethods.find((m) => m.id === payment)?.label || payment,
        note: customerNote.trim(),
        items: savedItems.map((i) => ({
          name: i.name,
          image: i.image,
          variant: i.variant || [i.size, i.color].filter(Boolean).join(", "),
          price: Number(i.price) || 0,
          qty: Number(i.qty) || 0,
        })),
        subtotal,
        deliveryCharge: delivery,
        discount: Math.max(0, subtotal + delivery - total),
        total,
      });
      checkout.complete();
      clearCart();
      router.push(
        `/order-success?invoiceId=${encodeURIComponent(order.invoiceId || order.orderId || "")}`,
      );
    } catch (error) {
      checkout.submitting.current = false;
      const message = error instanceof Error ? error.message : "";
      const lowerMessage = message.toLowerCase();
      if (
        (lowerMessage.includes("ip") && lowerMessage.includes("blocked")) ||
        lowerMessage.includes("order limit") ||
        lowerMessage.includes("try again after")
      ) {
        setErrorMsg(
          "আপনার IP address থেকে অর্ডার গ্রহণ সাময়িকভাবে বন্ধ আছে। সহায়তার জন্য আমাদের সাথে যোগাযোগ করুন।",
        );
      } else {
        setErrorMsg("অর্ডার দেওয়া যায়নি। আবার চেষ্টা করুন।");
      }
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    border: "none",
    outline: "none",
    padding: "13px 16px",
    fontSize: 14,
    color: "#333",
    background: "transparent",
  };

  const iconBox: React.CSSProperties = {
    background: "#f5f5f5",
    borderRight: "1px solid #e0e0e0",
    padding: "0 16px",
    display: "flex",
    alignItems: "center",
  };

  const fieldWrap: React.CSSProperties = {
    display: "flex",
    border: "1px solid #ddd",
    borderRadius: 8,
    overflow: "hidden",
    background: "#fff",
  };


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

      <main style={{ flex: 1, padding: "36px 0 48px" }}>
        <div style={{ width: "92%", maxWidth: 1300, margin: "0 auto" }}>
          <div className="checkout-main-grid">
            {/* ── Left: Form ── */}
            <div
              style={{
                background: "#fff",
                borderRadius: 10,
                overflow: "hidden",
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              }}
            >
              {/* Brand header */}
              <div style={{ background: "#FE7A0D", padding: "18px 28px" }}>
                <p
                  style={{
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 600,
                    margin: 0,
                  }}
                >
                  বিস্তারিত তথ্য পূরণ করুন এবং &apos;অর্ডার কনফার্ম করুন&apos;
                  বাটনে ক্লিক করুন।
                </p>
              </div>

              <div
                style={{
                  padding: "30px 28px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 20,
                }}
              >
                {/* Name */}
                <div>
                  <label
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#333",
                      display: "block",
                      marginBottom: 8,
                    }}
                  >
                    আপনার নাম <span style={{ color: "#D7262E" }}>*</span>
                  </label>
                  <div style={fieldWrap}>
                    <span style={iconBox}>
                      <svg
                        width="18"
                        height="18"
                        fill="none"
                        stroke="#888"
                        strokeWidth="1.8"
                        viewBox="0 0 24 24"
                      >
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <label
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#333",
                      display: "block",
                      marginBottom: 8,
                    }}
                  >
                    ফোন নাম্বার <span style={{ color: "#D7262E" }}>*</span>
                  </label>
                  <div style={fieldWrap}>
                    <span style={iconBox}>
                      <svg
                        width="18"
                        height="18"
                        fill="none"
                        stroke="#888"
                        strokeWidth="1.8"
                        viewBox="0 0 24 24"
                      >
                        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.82 19.79 19.79 0 01.01 1.18 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92v2z" />
                      </svg>
                    </span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="০ দিয়ে শুরু করে ১১ সংখ্যার মোবাইল নম্বর দিন"
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Address */}
                <div>
                  <label
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#333",
                      display: "block",
                      marginBottom: 8,
                    }}
                  >
                    আপনার পুরো ঠিকানা{" "}
                    <span style={{ color: "#D7262E" }}>*</span>
                  </label>
                  <div style={fieldWrap}>
                    <span style={iconBox}>
                      <svg
                        width="18"
                        height="18"
                        fill="none"
                        stroke="#888"
                        strokeWidth="1.8"
                        viewBox="0 0 24 24"
                      >
                        <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                </div>

                {/* Delivery area */}
                {deliveryAreas.length > 0 && (
                  <div>
                    <label
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#333",
                        display: "block",
                        marginBottom: 8,
                      }}
                    >
                      ডেলিভারি এরিয়া <span style={{ color: "#D7262E" }}>*</span>
                    </label>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                        gap: 12,
                      }}
                    >
                      {areaOptions.map((area) => {
                        const selected = area.Id === selectedArea?.Id;
                        return (
                          <label
                            key={area.Id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              padding: "13px 16px",
                              border: `1.5px solid ${selected ? "#FE7A0D" : "#ddd"}`,
                              borderRadius: 8,
                              background: selected ? "#FFF5EC" : "#fff",
                              cursor: "pointer",
                              fontSize: 14,
                              fontWeight: 600,
                              color: selected ? "#FE7A0D" : "#333",
                            }}
                          >
                            <input
                              type="radio"
                              name="delivery-area"
                              value={area.Id}
                              checked={selected}
                              onChange={() => setDeliveryAreaId(String(area.Id))}
                              style={{ accentColor: "#FE7A0D", margin: 0 }}
                            />
                            <span style={{ flex: 1 }}>{area.area}</span>
                            <span style={{ fontWeight: 500, color: "#666" }}>
                              ৳{fmt(getDeliveryAreaCharge(area))}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    {areaOptions.length === 0 && (
                      <p style={{ margin: "6px 0 0", fontSize: 13, color: "#D7262E" }}>
                        কার্টের পণ্যগুলো একই এরিয়াতে ডেলিভারি হয় না। আলাদা অর্ডার করুন।
                      </p>
                    )}
                    {selectedArea && freeDelivery && (
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: 13,
                          color: "#FE7A0D",
                          fontWeight: 500,
                        }}
                      >
                        {tierFreeDelivery && !allItemsFreeShipping
                          ? `${rewards?.tier?.current.name} মেম্বার হিসেবে ফ্রি ডেলিভারি`
                          : "এই অর্ডারে ফ্রি ডেলিভারি প্রযোজ্য"}
                      </p>
                    )}
                  </div>
                )}

                {/* Special notes */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowNote((v) => !v)}
                    style={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "#f5f5f5",
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      padding: "13px 16px",
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#333",
                      cursor: "pointer",
                    }}
                  >
                    বিশেষ নোট (ঐচ্ছিক)
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 13,
                      }}
                    >
                      {showNote ? "Hide" : "Show"}
                      <svg
                        width="14"
                        height="14"
                        fill="none"
                        stroke="#888"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        style={{
                          transform: showNote ? "rotate(180deg)" : "none",
                        }}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </span>
                  </button>
                  {showNote && (
                    <textarea
                      value={customerNote}
                      onChange={(e) => setCustomerNote(e.target.value)}
                      rows={3}
                      maxLength={500}
                      placeholder="ডেলিভারি সংক্রান্ত কোনো নির্দেশনা থাকলে লিখুন"
                      style={{
                        width: "100%",
                        marginTop: 10,
                        border: "1px solid #ddd",
                        borderRadius: 8,
                        padding: "12px 16px",
                        fontSize: 14,
                        color: "#333",
                        outline: "none",
                        resize: "vertical",
                        fontFamily: "inherit",
                        boxSizing: "border-box",
                      }}
                    />
                  )}
                </div>

                {/* Payment */}
                <div>
                  <label
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#333",
                      display: "block",
                      marginBottom: 12,
                    }}
                  >
                    পেমেন্ট মেথড <span style={{ color: "#D7262E" }}>*</span>
                  </label>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {paymentMethods.map((m) => (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => setPayment(m.id)}
                        style={{
                          border: `2px solid ${payment === m.id ? m.bg : "#e5e7eb"}`,
                          borderRadius: 10,
                          padding: "13px 14px",
                          background: payment === m.id ? `${m.bg}12` : "#fff",
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "all 0.15s",
                        }}
                      >
                        <span
                          style={{
                            display: "block",
                            fontSize: 14,
                            fontWeight: 800,
                            color: payment === m.id ? m.bg : "#333",
                          }}
                        >
                          {m.label}
                        </span>
                        <span
                          style={{
                            display: "block",
                            fontSize: 12,
                            color: "#6b7280",
                            marginTop: 4,
                            lineHeight: 1.4,
                          }}
                        >
                          {m.number
                            ? `Send money: ${m.number}`
                            : "পণ্য হাতে পেয়ে টাকা দিন"}
                        </span>
                      </button>
                    ))}
                  </div>
                  {payment !== "cod" && (
                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: 13,
                        color: "#6b7280",
                        lineHeight: 1.6,
                      }}
                    >
                      selected number-এ পেমেন্ট করে অর্ডার কনফার্ম করুন।
                      প্রয়োজনে আমাদের প্রতিনিধি ফোনে যাচাই করবে।
                    </p>
                  )}
                </div>

                {/* Advance note */}
                {/* <p style={{
                  fontSize: 14, color: "#555", background: "#fef3c7",
                  borderRadius: 8, padding: "12px 16px", margin: 0,
                  border: "1px solid #fde68a",
                }}>
                  এখন <strong>১০০ ৳</strong> পেমেন্ট করুন, বাকী{" "}
                  <strong>৳{fmt(remaining)}</strong> প্রোডাক্ট হাতে পেয়ে পরিশোধ করবেন।
                </p> */}

                {errorMsg && (
                  <p
                    style={{
                      color: "#D7262E",
                      fontSize: 13,
                      margin: 0,
                      background: "#fff1f1",
                      padding: "10px 14px",
                      borderRadius: 6,
                      border: "1px solid #fca5a5",
                    }}
                  >
                    {errorMsg}
                  </p>
                )}

                {/* Confirm button */}
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  style={{
                    background: loading ? "#aaa" : "#1A7D36",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "16px 0",
                    fontSize: 16,
                    fontWeight: 700,
                    cursor: loading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    opacity: loading ? 0.8 : 1,
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    viewBox="0 0 24 24"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  {loading ? "প্রসেস হচ্ছে..." : "অর্ডার কনফার্ম করুন"}
                </button>

                {/* Delivery policy — edited in admin › Website › General Setting */}
                <details className="delivery-policy">
                  <summary>
                    {settings?.deliveryPolicyTitle || "হোম ডেলিভারি পলিসি"}
                  </summary>
                  <div
                    className="delivery-policy-body"
                    dangerouslySetInnerHTML={{
                      __html:
                        settings?.deliveryPolicy || DEFAULT_DELIVERY_POLICY,
                    }}
                  />
                </details>
              </div>
            </div>

            {/* ── Right: Order Summary ── */}
            <div
              style={{
                background: "#fff",
                borderRadius: 10,
                overflow: "hidden",
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              }}
            >
              <div
                style={{
                  borderBottom: "2px solid #f0f0f0",
                  padding: "18px 22px",
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#222",
                  }}
                >
                  অর্ডার বিবরণ
                </h2>
              </div>

              {/* Cart lines */}
              <div style={{ borderBottom: "1px solid #eee" }}>
                {items.length === 0 ? (
                  <p
                    style={{
                      padding: "24px 22px",
                      color: "#999",
                      fontSize: 14,
                      textAlign: "center",
                    }}
                  >
                    কোনো পণ্য নেই
                  </p>
                ) : (
                  items.map((item, idx) => {
                    const variants = item.comboOfferId
                      ? []
                      : productVariants[item.id] || [];
                    const meta = [
                      variants.length > 1 ? null : item.variant,
                      item.size && `Size: ${item.size}`,
                      item.color && `Color: ${item.color}`,
                    ].filter(Boolean);
                    return (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          gap: 12,
                          padding: "16px 22px",
                          borderBottom:
                            idx === items.length - 1
                              ? "none"
                              : "1px solid #f0f0f0",
                        }}
                      >
                        <SafeImage
                          sources={[item.image, ...(item.images || [])]}
                          alt={item.name}
                          width={64}
                          height={64}
                          style={{
                            width: 64,
                            height: 64,
                            borderRadius: 8,
                            objectFit: "cover",
                            border: "1px solid #eee",
                            background: "#f8f8f8",
                            flexShrink: 0,
                          }}
                        />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              gap: 10,
                            }}
                          >
                            <p
                              style={{
                                margin: 0,
                                fontSize: 14,
                                fontWeight: 600,
                                color: "#222",
                                lineHeight: 1.4,
                              }}
                            >
                              {item.name}
                            </p>
                            <button
                              type="button"
                              onClick={() => removeFromCart(idx)}
                              aria-label="Remove"
                              title="মুছে ফেলুন"
                              style={{
                                flexShrink: 0,
                                width: 26,
                                height: 26,
                                borderRadius: 6,
                                border: "1px solid #fecaca",
                                background: "#fff5f5",
                                color: "#D7262E",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <svg
                                width="14"
                                height="14"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                viewBox="0 0 24 24"
                              >
                                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                              </svg>
                            </button>
                          </div>

                          {variants.length > 1 && (
                            <select
                              value={item.variantId ?? ""}
                              onChange={(e) => {
                                const next = variants.find(
                                  (v) => v.id === Number(e.target.value),
                                );
                                if (next) changeVariant(idx, next);
                              }}
                              style={{
                                display: "block",
                                width: "100%",
                                maxWidth: 240,
                                marginTop: 8,
                                border: "1px solid #ddd",
                                borderRadius: 6,
                                padding: "6px 8px",
                                fontSize: 13,
                                color: "#333",
                                background: "#fff",
                                cursor: "pointer",
                                outline: "none",
                              }}
                            >
                              {item.variantId === undefined && (
                                <option value="">
                                  {item.variant || "ভ্যারিয়েন্ট বেছে নিন"}
                                </option>
                              )}
                              {variants.map((v) => (
                                <option
                                  key={v.id}
                                  value={v.id}
                                  disabled={
                                    !v.inStock && v.id !== item.variantId
                                  }
                                >
                                  {variantLabel(v.options) || `#${v.id}`} — ৳
                                  {fmt(v.newPrice)}
                                  {!v.inStock ? " (স্টক নেই)" : ""}
                                </option>
                              ))}
                            </select>
                          )}

                          {meta.length > 0 && (
                            <p
                              style={{
                                margin: "4px 0 0",
                                fontSize: 12,
                                color: "#777",
                              }}
                            >
                              {meta.join(" · ")}
                            </p>
                          )}
                          {item.freeShipping && (
                            <p
                              style={{
                                margin: "4px 0 0",
                                fontSize: 11,
                                color: "#16a34a",
                                fontWeight: 700,
                              }}
                            >
                              Free Shipping
                            </p>
                          )}

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginTop: 10,
                            }}
                          >
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                border: "1px solid #ddd",
                                borderRadius: 6,
                                overflow: "hidden",
                              }}
                            >
                              {[
                                { label: "−", qty: item.qty - 1 },
                                null,
                                { label: "+", qty: item.qty + 1 },
                              ].map((btn) =>
                                btn ? (
                                  <button
                                    key={btn.label}
                                    type="button"
                                    onClick={() => updateQty(idx, btn.qty)}
                                    disabled={btn.qty < 1}
                                    style={{
                                      width: 30,
                                      height: 30,
                                      border: "none",
                                      background: "#f8f8f8",
                                      cursor:
                                        btn.qty < 1 ? "not-allowed" : "pointer",
                                      color: btn.qty < 1 ? "#bbb" : "#333",
                                      fontSize: 16,
                                    }}
                                  >
                                    {btn.label}
                                  </button>
                                ) : (
                                  <span
                                    key="qty"
                                    style={{
                                      minWidth: 36,
                                      textAlign: "center",
                                      fontSize: 14,
                                      fontWeight: 600,
                                      borderLeft: "1px solid #ddd",
                                      borderRight: "1px solid #ddd",
                                      lineHeight: "30px",
                                    }}
                                  >
                                    {item.qty}
                                  </span>
                                ),
                              )}
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <span
                                style={{
                                  display: "block",
                                  fontSize: 15,
                                  fontWeight: 700,
                                  color: "#222",
                                }}
                              >
                                ৳{fmt(item.price * item.qty)}
                              </span>
                              {item.qty > 1 && (
                                <span style={{ fontSize: 12, color: "#888" }}>
                                  ৳{fmt(item.price)} × {item.qty}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Price rows */}
              <div
                style={{
                  padding: "16px 22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {[
                  { label: "মোট", value: `৳${fmt(totalPrice)}` },
                  {
                    label: "ডেলিভারি চার্জ",
                    value: freeDelivery
                      ? "Free"
                      : `৳${fmt(deliveryCharge)}`,
                  },
                  { label: "ডিসকাউন্ট", value: `৳${fmt(discount)}` },
                  ...(rewardDiscount > 0
                    ? [{ label: `পয়েন্ট ডিসকাউন্ট (${fmt(redeemPoints)} পয়েন্ট)`, value: `-৳${fmt(rewardDiscount)}` }]
                    : []),
                ].map((row) => (
                  <div
                    key={row.label}
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span style={{ fontSize: 14, color: "#666" }}>
                      {row.label}
                    </span>
                    <span
                      style={{ fontSize: 14, fontWeight: 600, color: "#333" }}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
                <div
                  style={{
                    borderTop: "2px solid #eee",
                    paddingTop: 12,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{ fontSize: 16, fontWeight: 700, color: "#222" }}
                  >
                    সর্বমোট
                  </span>
                  <span
                    style={{ fontSize: 16, fontWeight: 700, color: "#222" }}
                  >
                    ৳{fmt(grandTotal)}
                  </span>
                </div>
              </div>

              {/* Coupon */}
              <div style={{ padding: "0 22px 22px" }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    type="text"
                    value={coupon}
                    onChange={(e) => {
                      setCoupon(e.target.value);
                      setAppliedCoupon(null);
                      setCouponMessage("");
                    }}
                    placeholder="Apply Coupon"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      padding: "12px 16px",
                      fontSize: 14,
                      outline: "none",
                      color: "#333",
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={couponLoading}
                    style={{
                      background: couponLoading ? "#9ca3af" : "#FE7A0D",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      padding: "0 18px",
                      flexShrink: 0,
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: couponLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    {couponLoading ? "..." : "APPLY"}
                  </button>
                </div>
                {couponMessage && (
                  <p
                    style={{
                      margin: "8px 0 0",
                      fontSize: 13,
                      color: appliedCoupon ? "#16a34a" : "#dc2626",
                    }}
                  >
                    {couponMessage}
                  </p>
                )}

                {/* Reward points (logged-in customers) */}
                {rewards?.settings.enabled && rewards.balance > 0 && (
                  <label
                    style={{
                      marginTop: 14,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "12px 14px",
                      borderRadius: 8,
                      border: `1px solid ${redeemPoints > 0 ? "#FE7A0D" : "#eee"}`,
                      background: redeemPoints > 0 ? "#FFF6EE" : "#fafafa",
                      cursor: redeemablePoints > 0 && rewardPhoneMatches ? "pointer" : "default",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={useRewardPoints && redeemablePoints > 0 && rewardPhoneMatches}
                      disabled={redeemablePoints === 0 || !rewardPhoneMatches}
                      onChange={(e) => setUseRewardPoints(e.target.checked)}
                      style={{ marginTop: 3, accentColor: "#FE7A0D" }}
                    />
                    <span style={{ fontSize: 13, color: "#444", lineHeight: "20px" }}>
                      আপনার <b>{fmt(rewards.balance)} রিওয়ার্ড পয়েন্ট</b> আছে।{" "}
                      {!rewardPhoneMatches
                        ? "পয়েন্ট ব্যবহার করতে আপনার অ্যাকাউন্টের ফোন নাম্বার দিন।"
                        : redeemablePoints > 0
                          ? `${fmt(redeemablePoints)} পয়েন্ট ব্যবহার করে ৳${fmt(redeemablePoints * rewards.settings.pointValue)} ছাড় নিন।`
                          : `কমপক্ষে ${fmt(rewards.settings.minRedeemPoints)} পয়েন্ট লাগবে (পণ্যের দামের সর্বোচ্চ ${fmt(rewards.settings.maxRedeemPercent)}%)।`}
                    </span>
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {footer}
    </div>
  );
}

export default function CheckoutPage(props: SiteChromeSlots) {
  return (
    <Suspense>
      <CheckoutContent {...props} />
    </Suspense>
  );
}
