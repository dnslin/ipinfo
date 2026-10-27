import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from 'next/font/google';
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { Toaster } from "@/components/ui/sonner";

// 字体配置
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "IP-Search",
  description: "精确查询IPv4/IPv6地址的地理位置、运营商信息和网络详情",
  keywords: "IP查询,IPv4,IPv6,地理位置,运营商,ASN,网络信息,IP定位",
  authors: [{ name: "dnslin" }],
  creator: "dnslin",
  publisher: "dnslin",
  robots: "index, follow",
  openGraph: {
    type: "website",
    locale: "zh_CN",
    title: "IP地址查询 - 精确查询IPv4/IPv6地址的地理位置、运营商信息和网络详情",
    description: "精确查询IPv4/IPv6地址的地理位置、运营商信息和网络详情",
    siteName: "IP-Search",
  },
  twitter: {
    card: "summary_large_image",
    title: "IP地址查询 - 精确查询IPv4/IPv6地址的地理位置、运营商信息和网络详情",
    description: "精确查询IPv4/IPv6地址的地理位置、运营商信息和网络详情",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8f7" },
    { media: "(prefers-color-scheme: dark)", color: "#17191a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
                let preference = null;
                try { preference = localStorage.getItem('theme'); } catch (_) {}
                const dark = preference === 'dark' ||
                  (preference !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                const root = document.documentElement;
                root.classList.toggle('dark', dark);
                root.classList.toggle('light', !dark);
                root.style.colorScheme = dark ? 'dark' : 'light';
            `,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <div id="root">
          {children}
        </div>
        <Toaster />
      </body>
    </html>
  );
}
