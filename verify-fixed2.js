function getCurrentWeek(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const beijingNow = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const year = beijingNow.getFullYear();
  const firstDayOfYear = new Date(year, 0, 1);
  const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
  const daysToFirstMonday = (8 - dayOfWeek) % 7;
  const firstMonday = new Date(firstDayOfYear);
  firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);

  const diffTime = beijingNow - firstMonday;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const weekNumber = Math.floor(diffDays / 7) + 1;
  return `${year}-${weekNumber.toString().padStart(2, '0')}`;
}

console.log('=== 直接测试日期 ===');
console.log('4月13日（周一）:', getCurrentWeek('2026-04-13T00:00:00.000Z'));
console.log('4月19日（周日）:', getCurrentWeek('2026-04-19T00:00:00.000Z'));
console.log('4月20日（周一）:', getCurrentWeek('2026-04-20T00:00:00.000Z'));

console.log('\n=== 详细计算4月20日 ===');
const d = new Date('2026-04-20T00:00:00.000Z');
const beijingNow = new Date(d.getTime() + 8 * 60 * 60 * 1000);
console.log('北京时间:', beijingNow.toISOString());
const year = beijingNow.getFullYear();
const firstDayOfYear = new Date(year, 0, 1);
console.log('1月1日:', firstDayOfYear.toISOString());
const dayOfWeek = firstDayOfYear.getUTCDay();
console.log('1月1日UTC星期:', dayOfWeek, '(周四)');
const daysToFirstMonday = (8 - dayOfWeek) % 7;
console.log('daysToFirstMonday:', daysToFirstMonday);
const firstMonday = new Date(firstDayOfYear);
firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);
console.log('第一个周一:', firstMonday.toISOString());
const diffTime = beijingNow - firstMonday;
console.log('diffTime (ms):', diffTime);
const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
console.log('diffDays:', diffDays);
const weekNumber = Math.floor(diffDays / 7) + 1;
console.log('weekNumber:', weekNumber);