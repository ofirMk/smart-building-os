import type { Metadata, Viewport } from "next";
import { Heebo, JetBrains_Mono, Rubik } from "next/font/google";
import { ThemeProvider } from "next-themes";

import { SonnerAudioBridge } from "@/components/marker-ofek/sonner-audio-bridge";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["latin", "hebrew"],
  /** טפסים וכותרות משנה: Light / ExtraLight לצד גוף טקסט רגיל */
  weight: ["200", "300", "400", "500", "600", "700"],
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
  themeColor: "#ffffff",
};

export const metadata: Metadata = {
  title: {
    template: "%s | מרקר אופק",
    default: "מרקר אופק - מערכת ניהול",
  },
  description: "מערכת ניהול פרויקטים ו-ERP מבוססת AI",
  manifest: "/manifest-tenant.json",
  appleWebApp: {
    title: "מרקר אופק",
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
    <html lang="he" dir="rtl" className="h-[100dvh]" suppressHydrationWarning>
      <body
        className={cn(
          heebo.variable,
          rubik.variable,
          jetbrainsMono.variable,
          "h-[100dvh] w-full overflow-hidden bg-background font-sans text-foreground antialiased selection:bg-blue-100"
        )}
        dir="rtl"
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          storageKey="smart-building-theme"
          enableSystem
          enableColorScheme
          disableTransitionOnChange
        >
          <TooltipProvider delay={0}>
            {/* LAYOUT INVARIANT — אין גלילה גלובלית. ראה dashboard-shell.tsx לפרטים. */}
            <div
              className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background"
              data-layout-region="root-shell"
            >
              <div
                className="flex flex-1 min-h-0 overflow-hidden"
                data-layout-region="root-content"
              >
                {children}
              </div>
            </div>
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
            <SonnerAudioBridge />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
