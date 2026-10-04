import "@radix-ui/themes/styles.css";
import "./globals.css";

import { Theme } from "@radix-ui/themes";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "Free Stuff Finder" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Theme accentColor="grass" grayColor="sage" radius="medium" panelBackground="solid">
          {children}
        </Theme>
      </body>
    </html>
  );
}
