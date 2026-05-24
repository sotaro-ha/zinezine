import type { Metadata } from 'next';
import { Fraunces } from 'next/font/google';
import './globals.css';

// 見出し用セリフ体（Inter は避ける方針）
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '旅写真マップ',
  description: '旅の写真を位置情報からマップに可視化する',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={fraunces.variable}>
      <body>{children}</body>
    </html>
  );
}
