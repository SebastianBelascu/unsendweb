import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Unsend",
  description: "One app for everything — chat, email, and calls.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${openSans.variable} h-full`}>
      <body className="min-h-full bg-canvas text-ink antialiased">
        {/* Apply the saved theme before paint to avoid a flash of the wrong one. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('unsend.theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}",
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
