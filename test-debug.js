// 调试时间计算
const beijingNow = new Date('2026-03-10T18:53:35Z');  // 模拟当前北京时间（UTC表示）
console.log('输入时间 (UTC):', beijingNow.toISOString());

// 步骤1：获取当前UTC时间对应的北京时间
const beijingTime = new Date(beijingNow.getTime() + 8 * 60 * 60 * 1000);
console.log('步骤1 - 加8小时后:', beijingTime.toISOString());

// 步骤2：获取北京时间的年月日
const year = beijingTime.getUTCFullYear();
const month = beijingTime.getUTCMonth();
const day = beijingTime.getUTCDate();
console.log('步骤2 - 年月日:', year, month, day);

// 步骤3：创建该日期的UTC时间00:00:00
const utcMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));
console.log('步骤3 - UTC午夜:', utcMidnight.toISOString());

// 步骤4：减去8小时
const beijingStartUTC = new Date(utcMidnight.getTime() - 8 * 60 * 60 * 1000);
console.log('步骤4 - 减8小时后:', beijingStartUTC.toISOString());

console.log('\n期望的北京时间00:00:00对应的UTC:', '2026-03-09T16:00:00.000Z');
