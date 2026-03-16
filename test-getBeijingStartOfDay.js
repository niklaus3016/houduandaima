const now = new Date();
console.log('当前UTC时间:', now.toISOString());

const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
console.log('当前北京时间:', beijingTime.toISOString());

const year = beijingTime.getUTCFullYear();
const month = beijingTime.getUTCMonth();
const day = beijingTime.getUTCDate();
console.log('北京时间年月日:', year, month, day);

const utcMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));
console.log('北京时间0点对应的UTC时间:', utcMidnight.toISOString());

const beijingStartUTC = new Date(utcMidnight.getTime() - 8 * 60 * 60 * 1000);
console.log('北京时间0点对应的UTC时间(减8小时):', beijingStartUTC.toISOString());

console.log('\n验证北京时间:');
const beijingStartBeijing = new Date(beijingStartUTC.getTime() + 8 * 60 * 60 * 1000);
console.log('beijingStartUTC对应的北京时间:', beijingStartBeijing.toISOString());
