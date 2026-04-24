// 验证4月17日的周数

function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

function getCurrentWeek(dateStr) {
  const now = dateStr ? new Date(dateStr) : getBeijingDate();
  const year = now.getFullYear();
  const firstDayOfYear = new Date(year, 0, 1);
  const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
  const daysToFirstMonday = (8 - dayOfWeek) % 7;
  const firstMonday = new Date(firstDayOfYear);
  firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);

  const diffTime = now - firstMonday;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const weekNumber = Math.floor(diffDays / 7) + 1;
  return `${year}-${weekNumber.toString().padStart(2, '0')}`;
}

console.log('=== 周数计算验证 ===');

// 测试几个日期
const testDates = [
  '2026-04-12T00:00:00.000Z',  // 周一
  '2026-04-13T00:00:00.000Z',  // 周一
  '2026-04-17T00:00:00.000Z',  // 周五
  '2026-04-18T00:00:00.000Z',  // 周六
  '2026-04-19T00:00:00.000Z',  // 周日
  '2026-04-20T00:00:00.000Z',  // 周一
];

testDates.forEach(dateStr => {
  const date = new Date(dateStr);
  const beijingDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const week = getCurrentWeek(date);
  console.log(`${dateStr} -> 北京时间: ${beijingDate.toISOString()} -> 周: ${week}, 星期${beijingDate.getUTCDay() === 0 ? 7 : beijingDate.getUTCDay()}`);
});

// 2026年的第一个周一
console.log('\n=== 2026年周起始计算 ===');
const firstDayOfYear = new Date(2026, 0, 1);
console.log('2026-01-01 是周几:', firstDayOfYear.getUTCDay());
console.log('2026年的第一个周一是:', new Date(2026, 0, 1 + (8 - firstDayOfYear.getUTCDay()) % 7).toISOString());

// 计算4月12日是否是周一
console.log('\n=== 检查4月12日 ===');
const april12 = new Date('2026-04-12T00:00:00.000Z');
console.log('4月12日 00:00 UTC 是周几:', april12.getUTCDay()); // 0=周日, 1=周一...
const april12Beijing = new Date(april12.getTime() + 8 * 60 * 60 * 1000);
console.log('4月12日北京时间:', april12Beijing.toISOString());
console.log('北京时间4月12日是周几:', april12Beijing.getUTCDay() === 0 ? 7 : april12Beijing.getUTCDay());