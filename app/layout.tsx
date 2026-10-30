import type { Metadata } from "next"
import { Inter } from "next/font/google"

import "./globals.css"
import {ThemeProvider} from "next-themes";
import { PwaRegister } from "@/components/pwa-register"

const inter = Inter({
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Engbek",
  description: "Build your English vocabulary with contextual explanations from Watch.",
  applicationName: "Engbek",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Engbek",
  },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icon-512.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
}

export default function RootLayout({
                                     children,
                                   }: Readonly<{
  children: React.ReactNode
}>) {
  return (
      <html lang="ru" suppressHydrationWarning>
      <body className={` antialiased`}>
          <PwaRegister />
          <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </body>
      </html>
  )
}
