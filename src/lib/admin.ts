/**
 * 管理者許可リスト。`ADMIN_EMAILS`（サーバー専用 env、カンマ/空白区切り）で指定する。
 * fail-closed: 未設定なら誰も管理者扱いしない。
 * NEXT_PUBLIC を付けないため、この判定はサーバー（Route Handler / middleware / Server Component）でのみ機能する。
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = adminEmails();
  if (list.length === 0) return false;
  return list.includes(email.toLowerCase());
}
