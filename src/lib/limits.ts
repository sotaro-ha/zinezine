/**
 * 利用上限。DB トリガー（docs/migrations/0005_limits.sql）で強制し、
 * ここの定数は API / UI の事前チェックと文言用に共有する。
 * 値を変えるときは必ずトリガー側も合わせること。
 */

/** 1 ユーザーが作成できる旅程の上限（共有された旅程は数えない）。 */
export const MAX_TRIPS_PER_USER = 5;

/** 1 つの旅程に追加できる写真の上限。 */
export const MAX_PHOTOS_PER_TRIP = 1000;
