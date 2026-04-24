// 模拟领取时的周计算
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

function getCurrentWeek() {
  const now = getBeijingDate();
  const year = now.getFullYear();
  const firstDayOfYear = new Date(year, 0, 1);
  const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
  const daysToFirstMonday = (8 - dayOfWeek) % 7;
  const firstMonday = new Date(firstDayOfYear);
  firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);

  const diffTime = now - firstMonday;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const weekNumber = Math.floor(diffDays / 7) + 1;
  return `${year}-${weekNumber.toString().padStart(2, '0')}`;
}

// 模拟领取时的北京时间
// claimedAt: "2026-04-17T08:23:08.639Z" 是UTC时间
// 对应北京时间是 2026-04-17T16:23:08
const claimedAtUTC = new Date('2026-04-17T08:23:08.639Z');
const claimedAtBeijing = new Date(claimedAtUTC.getTime() + 8 * 60 * 60 * 1000);

console.log('=== 领取时间分析 ===');
console.log('UTC时间:', claimedAtUTC.toISOString());
console.log('北京时间:', claimedAtBeijing.toISOString());
console.log('北京时间星期:', claimedAtBeijing.getUTCDay() === 0 ? 7 : claimedAtBeijing.getUTCDay());

// 模拟用北京时间计算周
const year = claimedAtBeijing.getFullYear();
const firstDayOfYear = new Date(year, 0, 1);
const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
const daysToFirstMonday = (8 - dayOfWeek) % 7;
const firstMonday = new Date(firstDayOfYear);
firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);

console.log('\n=== 周计算过程 ===');
console.log('firstDayOfYear:', firstDayOfYear.toISOString());
console.log('dayOfWeek (1月1日是周几):', dayOfWeek);
console.log('daysToFirstMonday:', daysToFirstMonday);
console.log('firstMonday:', firstMonday.toISOString());

const diffTime = claimedAtBeijing - firstMonday;
console.log('diffTime (毫秒):', diffTime);
console.log('diffDays (天):', diffTime / (1000 * 60 * 60 * 24));
const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
console.log('Math.floor(diffDays):', diffDays);
const weekNumber = Math.floor(diffDays / 7) + 1;
console.log('weekNumber:', weekNumber);
console.log('计算的周:', `${year}-${weekNumber.toString().padStart(2, '0')}`);

// 正确的结果应该是2026-15
console.log('\n=== 结论 ===');
console.log('4月17日(北京时间)应该属于第15周');
console.log('但领取记录写的是第16周');
console.log('问题出在领取时的周计算有bug');

// 检查4月17日到底属于哪一周
console.log('\n=== 详细分析 ===');
console.log('第14周: 4月6日(周一) - 4月12日(周日)');
console.log('第15周: 4月13日(周一) - 4月19日(周日)');
console.log('第16周: 4月20日(周一) - 4月26日(周日)');
console.log('4月17日明显在第15周范围内');