const now = new Date();
console.log('当前UTC时间:', now.toISOString());

const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
console.log('当前北京时间:', beijingTime.toISOString());

const year = beijingTime.getUTCFullYear();
const month = beijingTime.getUTCMonth();
const day = beijingTime.getUTCDate();
console.log('北京时间年月日:', year, month, day);

const utcMidnight = new Date(Date.UTC(year, month, day, -8, 0, 0));
console.log('北京时间0点对应的UTC时间(直接用-8小时):', utcMidnight.toISOString());
