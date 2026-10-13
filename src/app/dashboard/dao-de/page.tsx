"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

declare global {
  interface Window {
    DaoDe?: {
      mount: (el: HTMLElement, opt?: { theme?: "light" | "dark"; accent?: string }) => void;
    };
  }
}

export default function DaoDePage() {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.DaoDe) setReady(true);
  }, []);

  useEffect(() => {
    if (ready && ref.current && window.DaoDe) {
      window.DaoDe.mount(ref.current, { theme: "light", accent: "#059669" });
    }
  }, [ready]);

  return (
    <div>
      <Script src="/dao-de.js" strategy="afterInteractive" onReady={() => setReady(true)} />
      <div ref={ref} />
    </div>
  );
}