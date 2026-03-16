const now = new Date();
console.log('当前UTC时间:', now.toISOString());

// 方案1：直接使用北京时间字符串
const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
const beijingDateStr = beijingNow.toISOString().split('T')[0];
console.log('当前北京时间字符串:', beijingDateStr);

// 方案2：使用北京时间0点
const beijingStart = new Date(beijingNow);
beijingStart.setHours(0, 0, 0, 0);
console.log('北京时间0点:', beijingStart.toISOString());

// 方案3：获取今天的开始和结束（北京时间）
const todayStart = new Date(beijingNow);
todayStart.setHours(0, 0, 0, 0);
const todayEnd = new Date(beijingNow);
todayEnd.setHours(23, 59, 59, 999);
console.log('今天开始:', todayStart.toISOString());
console.log('今天结束:', todayEnd.toISOString());

// 测试日期比较
const testDate = new Date('2026-03-10T10:00:00Z');
const testBeijingDate = new Date(testDate.getTime() + 8 * 60 * 60 * 1000);
const testBeijingDateStr = testBeijingDate.toISOString().split('T')[0];
console.log('测试日期的北京时间:', testBeijingDateStr);
