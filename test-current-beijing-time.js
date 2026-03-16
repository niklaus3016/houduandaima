const now = new Date();
console.log('当前UTC时间:', now.toISOString());

// 检查 getBeijingDate 函数的实现
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

const beijingNow = getBeijingDate();
console.log('当前北京时间:', beijingNow.toISOString());
console.log('当前北京时间日期:', beijingNow.toISOString().split('T')[0]);

// 检查 getBeijingStartOfDay 函数
function getBeijingStartOfDay() {
  const beijingNow = getBeijingDate();
  const startOfDay = new Date(beijingNow);
  startOfDay.setHours(0, 0, 0, 0);
  return startOfDay;
}

const today = getBeijingStartOfDay();
console.log('今天开始:', today.toISOString());
console.log('今天开始日期:', today.toISOString().split('T')[0]);
