import type { Metadata, Viewport } from "next";
import { Heebo, JetBrains_Mono, Rubik } from "next/font/google";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["latin", "hebrew"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin", "hebrew"],
  weight: ["400", "500", "600", "700"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#ffffff",
};

export const metadata: Metadata = {
  title: {
    default: "בניין חכם — מערכת ניהול נכסים",
    template: "%s · בניין חכם",
  },
  description:
    "ניהול נכסים ברמה ארגונית: בניינים, קריאות שירות עם SLA, חיוב טעינה ומתקני דיירים.",
  manifest: "/manifest-tenant.json",
  appleWebApp: {
    title: "ניהול מבנים",
    capable: true,
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} ${rubik.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body dir="rtl" className="min-h-full flex flex-col font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          storageKey="smart-building-theme"
          enableSystem={false}
          enableColorScheme
          disableTransitionOnChange
        >
          <TooltipProvider delay={0}>
            {children}
            <Toaster
              position="top-center"
              richColors
              closeButton
              dir="rtl"
              toastOptions={{
                classNames: {
                  toast: "text-start",
                },
              }}
            />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
