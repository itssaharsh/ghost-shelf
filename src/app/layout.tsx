import type { Metadata } from "next";
import { Courier_Prime, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { TopBar } from "@/components/TopBar";

const display = Courier_Prime({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Source_Serif_4({ weight: ["400", "600"], subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Ghost Shelf: for the reference desk",
  description: "A desk tool for book titles a chatbot made up: it checks three sources, shows the patron what it found, and turns what they named into three books the library holds.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        <TopBar />
        {children}
      </body>
    </html>
  );
}
