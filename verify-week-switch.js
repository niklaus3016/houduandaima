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

console.log('=== 周数计算验证 ===');
console.log('4月13日（周一，本周开始）:', getWeek('2026-04-13T00:00:00.000Z'));
console.log('4月19日（周日，本周结束）:', getWeek('2026-04-19T00:00:00.000Z'));
console.log('4月19日24点（=4月20日0点）:', getWeek('2026-04-19T23:59:59.999Z'));
console.log('4月20日（周一，下周开始）:', getWeek('2026-04-20T00:00:00.000Z'));
console.log('');
console.log('所以4月20日0点会切换到第16周');