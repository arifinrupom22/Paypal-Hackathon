import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PACT — The Permission Layer for AI Payments",
  description:
    "PACT is an independent authorization layer for AI commerce: cryptographically signed mandates, deterministic policy enforcement and PayPal settlement.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${geist.variable} ${jetbrains.variable}`}
    >
      <head>
        <script
          // Applies the saved theme before first paint. Dark stays the default.
          dangerouslySetInnerHTML={{
            __html: "(function(){try{var t=localStorage.getItem('pact-theme');document.documentElement.dataset.theme=t==='light'?'light':'dark';}catch(e){}})();",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
