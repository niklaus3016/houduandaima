function getBeijingDate(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

function getBeijingStartOfDay(beijingTime) {
  const startOfDay = new Date(beijingTime);
  startOfDay.setHours(0, 0, 0, 0);
  return new Date(startOfDay.getTime() - 8 * 60 * 60 * 1000);
}

function getBeijingEndOfDay(beijingTime) {
  const endOfDay = new Date(beijingTime);
  endOfDay.setHours(23, 59, 59, 999);
  return new Date(endOfDay.getTime() - 8 * 60 * 60 * 1000);
}

const beijingNow = getBeijingDate();
const todayStart = getBeijingStartOfDay(beijingNow);
const todayEnd = getBeijingEndOfDay(beijingNow);

console.log('当前UTC时间:', new Date().toISOString());
console.log('当前北京时间(显示用):', new Date(new Date().getTime() + 8*60*60*1000).toISOString());
console.log('beijingNow:', beijingNow.toISOString());
console.log('todayStart:', todayStart.toISOString());
console.log('todayEnd:', todayEnd.toISOString());
console.log('');
console.log('查询条件: createTime >=', todayStart, 'AND createTime <', todayEnd);
console.log('即: 北京时间', new Date(todayStart.getTime() + 8*60*60*1000).toISOString(), '到', new Date(todayEnd.getTime() + 8*60*60*1000).toISOString());