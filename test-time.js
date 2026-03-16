// 测试时间计算逻辑
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

// 原来的实现
function getBeijingStartOfDayOld(date) {
  const beijingDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  beijingDate.setUTCHours(0, 0, 0, 0);
  return new Date(beijingDate.getTime() - 8 * 60 * 60 * 1000);
}

// 新的实现
function getBeijingStartOfDayNew(date) {
  const beijingDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  beijingDate.setHours(0, 0, 0, 0);  // 使用 setHours 而不是 setUTCHours
  return new Date(beijingDate.getTime() - 8 * 60 * 60 * 1000);
}

// 测试
const now = new Date('2026-03-10T10:49:52Z');  // 金币记录时间 UTC
console.log('金币记录时间 (UTC):', now.toISOString());
console.log('金币记录时间 (北京时间):', new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString());

const beijingNow = getBeijingDate();
console.log('\n当前北京时间:', beijingNow.toISOString());

const startOld = getBeijingStartOfDayOld(beijingNow);
console.log('\n旧实现 - 今日开始 (UTC):', startOld.toISOString());
console.log('旧实现 - 今日开始 (北京时间):', new Date(startOld.getTime() + 8 * 60 * 60 * 1000).toISOString());

const startNew = getBeijingStartOfDayNew(beijingNow);
console.log('\n新实现 - 今日开始 (UTC):', startNew.toISOString());
console.log('新实现 - 今日开始 (北京时间):', new Date(startNew.getTime() + 8 * 60 * 60 * 1000).toISOString());

console.log('\n金币记录是否在今日范围内:', now >= startOld && now < new Date(startOld.getTime() + 24 * 60 * 60 * 1000));
