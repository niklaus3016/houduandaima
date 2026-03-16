// 测试修复后的时间计算逻辑
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

// 修复后的实现
function getBeijingStartOfDay(date) {
  const beijingTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const year = beijingTime.getUTCFullYear();
  const month = beijingTime.getUTCMonth();
  const day = beijingTime.getUTCDate();
  const utcMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const beijingStartUTC = new Date(utcMidnight.getTime() - 8 * 60 * 60 * 1000);
  return beijingStartUTC;
}

// 测试
const now = new Date('2026-03-10T10:49:52Z');  // 金币记录时间 UTC
console.log('金币记录时间 (UTC):', now.toISOString());
console.log('金币记录时间 (北京时间):', new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString());

const beijingNow = new Date('2026-03-10T18:53:35Z');  // 模拟当前北京时间
console.log('\n当前北京时间:', beijingNow.toISOString());

const start = getBeijingStartOfDay(beijingNow);
console.log('\n修复后 - 今日开始 (UTC):', start.toISOString());
console.log('修复后 - 今日开始 (北京时间):', new Date(start.getTime() + 8 * 60 * 60 * 1000).toISOString());

const todayEnd = new Date(start.getTime() + 24 * 60 * 60 * 1000);
console.log('\n今日结束 (UTC):', todayEnd.toISOString());
console.log('今日结束 (北京时间):', new Date(todayEnd.getTime() + 8 * 60 * 60 * 1000).toISOString());

console.log('\n金币记录是否在今日范围内:', now >= start && now < todayEnd);
console.log('金币记录时间 >= 今日开始:', now >= start);
console.log('金币记录时间 < 今日结束:', now < todayEnd);
