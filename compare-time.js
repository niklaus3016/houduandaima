function getBeijingDate(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

// 首页 /users 接口的时间计算 (dashboard.js line 391-394)
function getDashboardTime() {
  const beijingNow = getBeijingDate();
  const todayStartBeijing = new Date(beijingNow);
  todayStartBeijing.setUTCHours(0, 0, 0, 0);
  const startDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
  const endDate = new Date();
  return { startDate, endDate, beijingNow };
}

// 排行榜接口的时间计算 (修改后的ranking.js)
function getRankingTime() {
  const beijingNow = getBeijingDate();
  const todayStartBeijing = new Date(beijingNow);
  todayStartBeijing.setUTCHours(0, 0, 0, 0);
  const startDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
  const endDate = new Date();
  return { startDate, endDate, beijingNow };
}

const dash = getDashboardTime();
const rank = getRankingTime();

console.log('=== 首页接口时间 ===');
console.log('beijingNow:', dash.beijingNow.toISOString());
console.log('startDate:', dash.startDate.toISOString());
console.log('endDate:', dash.endDate.toISOString());

console.log('\n=== 排行榜接口时间 ===');
console.log('beijingNow:', rank.beijingNow.toISOString());
console.log('startDate:', rank.startDate.toISOString());
console.log('endDate:', rank.endDate.toISOString());

console.log('\n=== 对比 ===');
console.log('startDate相同:', dash.startDate.getTime() === rank.startDate.getTime());
console.log('endDate相同:', dash.endDate.getTime() === rank.endDate.getTime());