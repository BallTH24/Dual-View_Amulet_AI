import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dual-View Amulet AI | ระบบสแกนพระเครื่อง 2 ด้าน ประเมินสภาพและราคากลาง",
  description: "ระบบสแกนพระเครื่อง 2 ด้าน (ด้านหน้า และ ด้านหลัง) วิเคราะห์พิมพ์ทรง ร่องยันต์ ประเมินเปอร์เซ็นต์ความสมบูรณ์ ราคากลาง และแนะนำภูมิภาคปล่อยเช่า ภายใน 1 นาที",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className="dark">
      <body className="min-h-screen bg-[#0a0d14] text-slate-100 antialiased selection:bg-amber-500/30 selection:text-amber-200">
        {children}
      </body>
    </html>
  );
}
