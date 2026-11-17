"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { BASE } from "@/lib/api";
import { markPixelsReady, rememberCampaignParams, trackPageView } from "@/lib/pixel";

interface TrackingConfig {
  metaPixels?: { pixelsId: string }[];
  tiktokPixels?: { pixelCode: string }[];
  googleAds?: { conversionId: string; conversionLabel?: string | null }[];
}

function appendScript(id: string, src: string) {
  if (document.getElementById(id)) return;
  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

function initMeta(pixelIds: string[]) {
  if (!pixelIds.length) return;
  if (typeof window.fbq !== "function") {
    // Same as Meta's official stub: once fbevents.js loads it sets callMethod, and
    // every later call (AddToCart, Purchase, ...) must go through it, not the queue.
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue?.push(args);
    } as Window["fbq"] & { disablePushState?: boolean };
    // PageView is tracked manually on route change (with an eventID for dedup);
    // stop the pixel from sending its own extra PageView on history changes.
    fbq.disablePushState = true;
    window.fbq = fbq;
    window.fbq.queue = [];
    window.fbq.loaded = true;
    window.fbq.version = "2.0";
    window._fbq = window.fbq;
    appendScript("meta-pixel-sdk", "https://connect.facebook.net/en_US/fbevents.js");
  }
  pixelIds.forEach((id) => window.fbq("init", id));
}

type TiktokQueue = unknown[] & {
  methods: string[];
  setAndDefer: (target: unknown[], method: string) => void;
  instance: (pixelCode: string) => unknown[];
  load: (pixelCode: string) => void;
  _i?: Record<string, unknown[] & { _u?: string }>;
  _t?: Record<string, number>;
  _o?: Record<string, Record<string, unknown>>;
};

// TikTok's official base code. events.js finds the queue through
// window.TiktokAnalyticsObject, so without it no browser event reaches TikTok.
function initTiktok(pixelCodes: string[]) {
  if (!pixelCodes.length) return;
  const w = window as unknown as Record<string, unknown>;
  w.TiktokAnalyticsObject = "ttq";
  if (!w.ttq) {
    const ttq = [] as unknown as TiktokQueue;
    ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent"];
    ttq.setAndDefer = (target, method) => {
      (target as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => target.push([method, ...args]);
    };
    ttq.methods.forEach((method) => ttq.setAndDefer(ttq, method));
    ttq.instance = (pixelCode) => {
      const instance = (ttq._i?.[pixelCode] || []) as unknown[];
      ttq.methods.forEach((method) => ttq.setAndDefer(instance, method));
      return instance;
    };
    ttq.load = (pixelCode) => {
      const src = "https://analytics.tiktok.com/i18n/pixel/events.js";
      ttq._i = ttq._i || {};
      ttq._i[pixelCode] = Object.assign([], { _u: src });
      ttq._t = ttq._t || {};
      ttq._t[pixelCode] = Date.now();
      ttq._o = ttq._o || {};
      ttq._o[pixelCode] = {};
      appendScript(`tiktok-pixel-sdk-${pixelCode}`, `${src}?sdkid=${encodeURIComponent(pixelCode)}&lib=ttq`);
    };
    w.ttq = ttq;
  }
  const ttq = w.ttq as { load?: (pixelCode: string) => void };
  pixelCodes.forEach((code) => ttq.load?.(code));
}

function initGoogleAds(configs: NonNullable<TrackingConfig["googleAds"]>) {
  const first = configs.find((item) => item.conversionId);
  if (!first) return;
  window.__googleAdsConfigs = configs;
  appendScript("google-gtag-sdk", `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(first.conversionId)}`);
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function (...args: unknown[]) {
    window.dataLayer.push(args);
  };
  window.gtag("js", new Date());
  configs.forEach((item) => window.gtag?.("config", item.conversionId, { send_page_view: false }));
}

export default function MetaPixel() {
  const pathname = usePathname();

  useEffect(() => {
    fetch(`${BASE}/tracking/config`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const config = (json?.data || {}) as TrackingConfig;
        initMeta((config.metaPixels || []).map((item) => item.pixelsId).filter(Boolean));
        initTiktok((config.tiktokPixels || []).map((item) => item.pixelCode).filter(Boolean));
        initGoogleAds(config.googleAds || []);
      })
      .catch(() => {})
      .finally(markPixelsReady);
  }, []);

  // Fires on first load and on every client-side route change; browser side waits for init
  useEffect(() => {
    rememberCampaignParams();
    trackPageView();
  }, [pathname]);

  return null;
}
