const now = new Date();
const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);

console.log('=== 当前时间信息 ===');
console.log('服务器本地时间:', now.toISOString());
console.log('北京时间:', beijingNow.toISOString());
console.log('北京日期:', beijingNow.toISOString().split('T')[0]);

// 新的 getCurrentWeek 函数
function getCurrentWeek() {
  const now = beijingNow;
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

// 新的 getWeekRange 函数
function getWeekRange(week) {
  const [year, weekNumber] = week.split('-').map(Number);
  const firstDayOfYear = new Date(year, 0, 1);
  const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
  const daysToFirstMonday = (8 - dayOfWeek) % 7;
  const firstMonday = new Date(firstDayOfYear);
  firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);
  
  const weekStart = new Date(firstMonday);
  weekStart.setDate(weekStart.getDate() + (weekNumber - 1) * 7);
  weekStart.setHours(0, 0, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  weekEnd.setHours(0, 0, 0, 0);
  
  // 转换为UTC时间
  return {
    start: new Date(weekStart.getTime() - 8 * 60 * 60 * 1000),
    end: new Date(weekEnd.getTime() - 8 * 60 * 60 * 1000)
  };
}

const currentWeek = getCurrentWeek();
const weekRange = getWeekRange(currentWeek);

console.log('\n=== 周目标计算 ===');
console.log('当前周:', currentWeek);
console.log('本周开始:', weekRange.start.toISOString());
console.log('本周结束:', weekRange.end.toISOString());

// 检查今天是否在本周范围内
const todayUTC = new Date(beijingNow.getTime() - 8 * 60 * 60 * 1000);
const isInCurrentWeek = todayUTC >= weekRange.start && todayUTC < weekRange.end;
console.log('\n=== 验证 ===');
console.log('今天(UTC):', todayUTC.toISOString());
console.log('今天是否在本周范围内:', isInCurrentWeek);

if (isInCurrentWeek) {
  console.log('✅ 修复成功：今天在本周范围内');
} else {
  console.log('❌ 修复失败：今天不在本周范围内');
}

// 测试不同日期
const testDates = [
  new Date('2026-04-13T00:00:00+08:00'), // 周一
  new Date('2026-04-19T00:00:00+08:00'), // 周日
  new Date('2026-04-20T00:00:00+08:00')  // 周一（下周）
];

console.log('\n=== 测试不同日期 ===');
testDates.forEach((testDate, index) => {
  const originalBeijingNow = beijingNow;
  beijingNow = testDate;
  
  const testCurrentWeek = getCurrentWeek();
  const testWeekRange = getWeekRange(testCurrentWeek);
  const testTodayUTC = new Date(testDate.getTime() - 8 * 60 * 60 * 1000);
  const testIsInCurrentWeek = testTodayUTC >= testWeekRange.start && testTodayUTC < testWeekRange.end;
  
  console.log(`日期 ${index + 1}: ${testDate.toISOString().split('T')[0]}`);
  console.log(`  当前周: ${testCurrentWeek}`);
  console.log(`  本周开始: ${testWeekRange.start.toISOString()}`);
  console.log(`  本周结束: ${testWeekRange.end.toISOString()}`);
  console.log(`  是否在本周: ${testIsInCurrentWeek ? '✅' : '❌'}`);
  
  beijingNow = originalBeijingNow;
});