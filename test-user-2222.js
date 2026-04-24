const now = new Date();
const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);

console.log('=== 测试周目标修复 ===');
console.log('当前北京时间:', beijingNow.toISOString());
console.log('当前北京日期:', beijingNow.toISOString().split('T')[0]);

// 测试用户2222的周数据
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

console.log('\n=== 周目标计算结果 ===');
console.log('当前周:', currentWeek);
console.log('本周开始(UTC):', weekRange.start.toISOString());
console.log('本周开始(北京时间):', new Date(weekRange.start.getTime() + 8 * 60 * 60 * 1000).toISOString());
console.log('本周结束(UTC):', weekRange.end.toISOString());
console.log('本周结束(北京时间):', new Date(weekRange.end.getTime() + 8 * 60 * 60 * 1000).toISOString());

// 验证今天是否在本周范围内
const todayUTC = new Date(beijingNow.getTime() - 8 * 60 * 60 * 1000);
const isInCurrentWeek = todayUTC >= weekRange.start && todayUTC < weekRange.end;

console.log('\n=== 验证 ===');
console.log('今天(UTC):', todayUTC.toISOString());
console.log('今天(北京时间):', beijingNow.toISOString());
console.log('今天是否在本周范围内:', isInCurrentWeek);

if (isInCurrentWeek) {
  console.log('✅ 修复成功：今天在本周范围内');
  console.log('✅ 用户2222的周数据应该显示正确');
} else {
  console.log('❌ 修复失败：今天不在本周范围内');
  console.log('❌ 用户2222的周数据仍然会显示为0');
}

// 测试4月20日（明天）的周计算
const tomorrowBeijing = new Date(beijingNow);
tomorrowBeijing.setDate(tomorrowBeijing.getDate() + 1);
const tomorrowUTC = new Date(tomorrowBeijing.getTime() - 8 * 60 * 60 * 1000);
const isTomorrowInCurrentWeek = tomorrowUTC >= weekRange.start && tomorrowUTC < weekRange.end;

console.log('\n=== 明天（4月20日）验证 ===');
console.log('明天(北京时间):', tomorrowBeijing.toISOString());
console.log('明天是否在本周范围内:', isTomorrowInCurrentWeek);

if (!isTomorrowInCurrentWeek) {
  console.log('✅ 修复成功：明天会切换到新的一周');
} else {
  console.log('❌ 修复失败：明天仍然在当前周');
}