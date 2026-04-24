const now = new Date();
const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);

// 测试4月13日和4月19日
const apr13 = new Date('2026-04-13T00:00:00.000Z');
const apr19 = new Date('2026-04-19T00:00:00.000Z');

function getWeek(dateStr) {
  const d = new Date(dateStr);
  const beijingDate = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const year = beijingDate.getFullYear();
  const firstDayOfYear = new Date(year, 0, 1);
  const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
  const daysToFirstMonday = (8 - dayOfWeek) % 7;
  const firstMonday = new Date(firstDayOfYear);
  firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);

  const diffTime = beijingDate - firstMonday;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const weekNumber = Math.floor(diffDays / 7) + 1;
  return `${year}-${weekNumber.toString().padStart(2, '0')}`;
}

console.log('4月13日（周一）:', getWeek('2026-04-13T00:00:00.000Z'));
console.log('4月19日（周日）:', getWeek('2026-04-19T00:00:00.000Z'));
console.log('今天:', getWeek(now.toISOString()));