// 正确的时区计算
// 北京时间 = UTC + 8小时
// UTC = 北京时间 - 8小时

// 当前UTC时间
const now = new Date();
console.log('当前UTC时间:', now.toISOString());

// 当前北京时间
const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
console.log('当前北京时间:', beijingNow.toISOString());

// 北京时间 2026-03-10 00:00:00 对应的 UTC 时间
// UTC = 北京时间 - 8小时 = 2026-03-09 16:00:00
const beijingDateStr = '2026-03-10';
const [year, month, day] = beijingDateStr.split('-').map(Number);
const beijingStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0)); // 北京时间 00:00:00
const utcStart = new Date(beijingStart.getTime() - 8 * 60 * 60 * 1000); // 减去8小时得到UTC

console.log('\n北京时间 2026-03-10 00:00:00 对应的 UTC:', utcStart.toISOString());
console.log('验证 - UTC + 8小时:', new Date(utcStart.getTime() + 8 * 60 * 60 * 1000).toISOString());

// 金币记录时间（UTC）
const goldRecord = new Date('2026-03-10T10:49:52Z');
console.log('\n金币记录时间 (UTC):', goldRecord.toISOString());
console.log('金币记录时间 (北京时间):', new Date(goldRecord.getTime() + 8 * 60 * 60 * 1000).toISOString());

// 检查金币记录是否在今日范围内
const todayStartUTC = new Date('2026-03-09T16:00:00Z'); // 北京时间3月10日00:00:00对应的UTC
const todayEndUTC = new Date(todayStartUTC.getTime() + 24 * 60 * 60 * 1000);

console.log('\n今日开始 (UTC):', todayStartUTC.toISOString());
console.log('今日结束 (UTC):', todayEndUTC.toISOString());
console.log('金币记录在今日范围内:', goldRecord >= todayStartUTC && goldRecord < todayEndUTC);
