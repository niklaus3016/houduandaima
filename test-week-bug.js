const now = new Date();
const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);

console.log('=== 当前时间信息 ===');
console.log('服务器本地时间:', now.toISOString());
console.log('北京时间:', beijingNow.toISOString());
console.log('北京日期:', beijingNow.toISOString().split('T')[0]);

console.log('\n=== 星期计算对比 ===');
console.log('getDay() (本地时区):', beijingNow.getDay());
console.log('getUTCDay() (UTC):', beijingNow.getUTCDay());

console.log('\n=== 本周开始计算 ===');
// 旧逻辑 (getDay)
const dayOfWeekOld = beijingNow.getDay() || 7;
const daysToMondayOld = dayOfWeekOld - 1;
const mondayOld = new Date(beijingNow);
mondayOld.setDate(mondayOld.getDate() - daysToMondayOld);
mondayOld.setHours(0, 0, 0, 0);
console.log('旧逻辑 (getDay):');
console.log('  dayOfWeek:', dayOfWeekOld);
console.log('  daysToMonday:', daysToMondayOld);
console.log('  本周开始:', mondayOld.toISOString());

// 新逻辑 (getUTCDay)
const dayOfWeekNew = beijingNow.getUTCDay() || 7;
const daysToMondayNew = dayOfWeekNew - 1;
const mondayNew = new Date(beijingNow);
mondayNew.setDate(mondayNew.getDate() - daysToMondayNew);
mondayNew.setHours(0, 0, 0, 0);
console.log('新逻辑 (getUTCDay):');
console.log('  dayOfWeek:', dayOfWeekNew);
console.log('  daysToMonday:', daysToMondayNew);
console.log('  本周开始:', mondayNew.toISOString());

console.log('\n=== 验证 ===');
console.log('今天是周几 (UTC):', beijingNow.getUTCDay(), '(0=周日, 1=周一, ..., 6=周六)');
console.log('今天是周几 (本地):', beijingNow.getDay());
console.log('如果今天4月19日是周日，getUTCDay()应该返回0');