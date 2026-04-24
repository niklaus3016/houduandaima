const now = new Date();
const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);

console.log('=== 当前时间信息 ===');
console.log('服务器本地时间:', now.toISOString());
console.log('北京时间:', beijingNow.toISOString());
console.log('北京日期:', beijingNow.toISOString().split('T')[0]);

// 测试不同的周计算方法

// 方法1: 当前实现
function getCurrentWeek1() {
  const now = beijingNow;
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getUTCDay() + 1) / 7);
  return `${now.getFullYear()}-${weekNumber.toString().padStart(2, '0')}`;
}

// 方法2: 基于周一的周计算
function getCurrentWeek2() {
  const now = beijingNow;
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfWeek = now.getUTCDay() || 7; // 0=周日改为7
  const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
  const adjustedDays = days - (dayOfWeek - 1); // 调整到本周一
  const weekNumber = Math.ceil((adjustedDays + startOfYear.getUTCDay() + 1) / 7) + 1;
  return `${now.getFullYear()}-${weekNumber.toString().padStart(2, '0')}`;
}

// 方法3: 直接计算
function getCurrentWeek3() {
  const now = beijingNow;
  const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
  const daysToFirstMonday = (8 - dayOfWeek) % 7;
  const firstMonday = new Date(firstDayOfYear);
  firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);
  
  const diffTime = now - firstMonday;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const weekNumber = Math.floor(diffDays / 7) + 1;
  return `${now.getFullYear()}-${weekNumber.toString().padStart(2, '0')}`;
}

console.log('\n=== 周数计算对比 ===');
console.log('方法1 (当前):', getCurrentWeek1());
console.log('方法2 (调整):', getCurrentWeek2());
console.log('方法3 (直接):', getCurrentWeek3());

// 测试具体日期的周数
const testDates = [
  new Date('2026-04-13T00:00:00+08:00'), // 周一
  new Date('2026-04-19T00:00:00+08:00'), // 周日
  new Date('2026-04-20T00:00:00+08:00')  // 周一（下周）
];

console.log('\n=== 测试具体日期 ===');
testDates.forEach((date, index) => {
  const testBeijingNow = date;
  const dayOfWeek = testBeijingNow.getUTCDay() || 7;
  
  // 方法3 应用到测试日期
  const firstDayOfYear = new Date(testBeijingNow.getFullYear(), 0, 1);
  const dayOfWeekFirst = firstDayOfYear.getUTCDay() || 7;
  const daysToFirstMonday = (8 - dayOfWeekFirst) % 7;
  const firstMonday = new Date(firstDayOfYear);
  firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);
  
  const diffTime = testBeijingNow - firstMonday;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const weekNumber = Math.floor(diffDays / 7) + 1;
  
  console.log(`日期 ${index + 1}: ${testBeijingNow.toISOString().split('T')[0]}`);
  console.log(`  周几: ${dayOfWeek} (1=周一, 7=周日)`);
  console.log(`  周数: 2026-${weekNumber.toString().padStart(2, '0')}`);
});