function getWeek(dateStr) {
  const d = new Date(dateStr);
  const beijingDate = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const beijingYear = beijingDate.getFullYear();
  const firstDayOfYear = new Date(beijingYear, 0, 1);
  const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
  const daysToFirstMonday = (8 - dayOfWeek) % 7;
  const firstMonday = new Date(firstDayOfYear);
  firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);

  const diffTime = beijingDate - firstMonday;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const weekNumber = Math.floor(diffDays / 7) + 1;
  return `${beijingYear}-${weekNumber.toString().padStart(2, '0')}`;
}

console.log('=== 验证4月日期 ===');
console.log('4月1日:', getWeek('2026-04-01T00:00:00.000Z'));
console.log('4月6日:', getWeek('2026-04-06T00:00:00.000Z'));
console.log('4月13日:', getWeek('2026-04-13T00:00:00.000Z'));
console.log('4月20日:', getWeek('2026-04-20T00:00:00.000Z'));
console.log('4月27日:', getWeek('2026-04-27T00:00:00.000Z'));

console.log('\n=== API返回的周 ===');
console.log('API返回: 13, 14, 15, 16, 17');
console.log('第13周: 3月30日~4月5日 (部分4月日)');
console.log('第14周: 4月6日~4月12日');
console.log('第15周: 4月13日~4月19日');
console.log('第16周: 4月20日~4月26日');
console.log('第17周: 4月27日~5月3日 (部分4月日)');

console.log('\n结论: 4月20日~4月26日 = 第16周');