// 验证周数计算
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

console.log('=== 周数计算验证 ===');
console.log('当前北京时间:', getBeijingDate().toISOString());
console.log('当前周:', getCurrentWeek());

// 检查2026-04-18应该是第几周
const testDate = new Date('2026-04-18T12:00:00Z');
const beijingTest = new Date(testDate.getTime() + 8 * 60 * 60 * 1000);
console.log('\n2026-04-18 12:00:00 UTC 对应北京时间:', beijingTest.toISOString());

// 检查领取记录的时间
console.log('\n领取记录分析:');
console.log('数据库中领取记录是第16周');
console.log('但根据周计算，今天(4月18日)应该是第15周');
console.log('这说明周计算可能有问题');

const april18 = new Date('2026-04-18T00:00:00.000Z');
const beijingApril18 = new Date(april18.getTime() + 8 * 60 * 60 * 1000);
console.log('\n2026-04-18 00:00 UTC 对应北京时间:', beijingApril18.toISOString());
console.log('北京时间4月18日是周几:', beijingApril18.getDay());