function getBeijingDate(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

function getBeijingStartOfDay(beijingTime) {
  const year = beijingTime.getUTCFullYear();
  const month = beijingTime.getUTCMonth();
  const day = beijingTime.getUTCDate();
  return new Date(Date.UTC(year, month, day, 0, 0, 0));
}

const beijingNow = getBeijingDate();
console.log('当前UTC时间:', new Date().toISOString());
console.log('计算的北京时间:', beijingNow.toISOString());
console.log('北京时间年月日:', beijingNow.getUTCFullYear(), beijingNow.getUTCMonth() + 1, beijingNow.getUTCDate());
console.log('北京时间时分秒:', beijingNow.getUTCHours(), beijingNow.getUTCMinutes(), beijingNow.getUTCSeconds());

const todayStart = getBeijingStartOfDay(beijingNow);
console.log('\n计算的今日开始时间(UTC):', todayStart.toISOString());
console.log('今日开始时间戳:', todayStart.getTime());

// 查询用的时间戳
const now = Date.now();
console.log('\n当前时间戳:', now);
console.log('时间差:', now - todayStart.getTime(), '毫秒 = ', (now - todayStart.getTime()) / 1000 / 60, '分钟');