// 测试最终修复后的时间计算逻辑

// 获取北京时间（UTC + 8小时）
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

// 获取北京时间的当天开始（返回UTC时间）
function getBeijingStartOfDay(beijingTime) {
  const year = beijingTime.getUTCFullYear();
  const month = beijingTime.getUTCMonth();
  const day = beijingTime.getUTCDate();
  const utcMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const beijingStartUTC = new Date(utcMidnight.getTime() - 8 * 60 * 60 * 1000);
  return beijingStartUTC;
}

// 模拟当前时间（UTC）
const mockNow = new Date('2026-03-10T10:55:00Z');  // 当前UTC时间
console.log('当前UTC时间:', mockNow.toISOString());

const beijingNow = new Date(mockNow.getTime() + 8 * 60 * 60 * 1000);  // 模拟getBeijingDate
console.log('当前北京时间:', beijingNow.toISOString());

const todayStart = getBeijingStartOfDay(beijingNow);
console.log('\n今日开始 (UTC):', todayStart.toISOString());
console.log('今日开始 (北京时间):', new Date(todayStart.getTime() + 8 * 60 * 60 * 1000).toISOString());

const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
console.log('\n今日结束 (UTC):', todayEnd.toISOString());
console.log('今日结束 (北京时间):', new Date(todayEnd.getTime() + 8 * 60 * 60 * 1000).toISOString());

// 金币记录时间（UTC）
const goldRecord = new Date('2026-03-10T10:49:52Z');
console.log('\n金币记录时间 (UTC):', goldRecord.toISOString());
console.log('金币记录时间 (北京时间):', new Date(goldRecord.getTime() + 8 * 60 * 60 * 1000).toISOString());

console.log('\n金币记录是否在今日范围内:', goldRecord >= todayStart && goldRecord < todayEnd);
