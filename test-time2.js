function getBeijingDate(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

function getBeijingStartOfDay(beijingTime) {
  // beijingTime已经是加上8小时后的时间
  // 要获取北京时间的0点，需要将beijingTime的时分秒设为0，然后转换为UTC时间
  const startOfDay = new Date(beijingTime);
  startOfDay.setUTCHours(0, 0, 0, 0);
  // 转换为UTC时间（减去8小时）
  return new Date(startOfDay.getTime() - 8 * 60 * 60 * 1000);
}

// 测试当前时间
const now = new Date();
const beijingNow = getBeijingDate(now);
const todayStart = getBeijingStartOfDay(beijingNow);

console.log('当前UTC时间:', now.toISOString());
console.log('当前北京时间:', beijingNow.toISOString());
console.log('今日开始时间(UTC):', todayStart.toISOString());
console.log('今日开始时间(北京):', getBeijingDate(todayStart).toISOString());

// 测试4月20日的开始时间
const testDate = new Date('2026-04-20T12:00:00Z'); // UTC时间
const beijingTestDate = getBeijingDate(testDate);
const april20Start = getBeijingStartOfDay(beijingTestDate);

console.log('\n测试4月20日:');
console.log('测试UTC时间:', testDate.toISOString());
console.log('测试北京时间:', beijingTestDate.toISOString());
console.log('4月20日开始时间(UTC):', april20Start.toISOString());
console.log('4月20日开始时间(北京):', getBeijingDate(april20Start).toISOString());