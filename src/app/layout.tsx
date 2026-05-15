import type { Metadata } from "next";
import { Geist, Geist_Mono, Poppins, DM_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Glance V2 - Smart Finance Tracker",
  description: "Kelola keuangan semudah berkedip. Personal finance tracker with beautiful glassmorphism UI.",
  keywords: ["Glance", "Finance", "Tracker", "Expense", "Income"],
  authors: [{ name: "Glance Team" }],
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} ${dmSans.variable} antialiased`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
