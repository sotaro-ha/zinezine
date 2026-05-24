import { redirect } from 'next/navigation';

// 認証は middleware が担保。ログイン済み管理者はそのまま旅程一覧へ。
export default function Home() {
  redirect('/trips');
}
