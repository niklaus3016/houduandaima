function getBeijingDate(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

function getBeijingStartOfDay(beijingTime) {
  const year = beijingTime.getUTCFullYear();
  const month = beijingTime.getUTCMonth();
  const day = beijingTime.getUTCDate();
  return new Date(Date.UTC(year, month, day, 0, 0, 0) - 8 * 60 * 60 * 1000);
}

function getBeijingStartOfMonth(beijingTime) {
  const year = beijingTime.getUTCFullYear();
  const month = beijingTime.getUTCMonth();
  return new Date(Date.UTC(year, month, 1, 0, 0, 0) - 8 * 60 * 60 * 1000);
}

function getYesterdayStart(beijingTime) {
  const todayStart = getBeijingStartOfDay(beijingTime);
  return new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
}

const now = new Date();
const beijingNow = getBeijingDate();
const todayStart = getBeijingStartOfDay(beijingNow);

console.log('当前UTC时间:', now.toISOString());
console.log('计算的北京时间:', beijingNow.toISOString());
console.log('北京时间年月日:', beijingNow.getUTCFullYear(), beijingNow.getUTCMonth() + 1, beijingNow.getUTCDate());
console.log('北京时间小时:', beijingNow.getUTCHours());
console.log('计算的今日开始UTC时间:', todayStart.toISOString());
console.log('验证: 北京时间4月20日0点 = UTC:', new Date(Date.UTC(2026, 3, 20, 0, 0, 0) - 8*60*60*1000).toISOString());