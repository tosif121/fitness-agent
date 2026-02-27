import type { Metadata } from 'next';
import { Jost } from 'next/font/google';
import './globals.css';

const jostSans = Jost({
  variable: '--font-jost-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'FitAgent — AI Personal Trainer',
  description:
    'Real-time AI fitness coach powered by YOLO11 pose detection and Gemini Live. Get instant form corrections, rep counting, and voice coaching through your webcam.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${jostSans.variable} antialiased`}>{children}</body>
    </html>
  );
}
