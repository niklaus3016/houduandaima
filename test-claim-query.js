const mongoose = require('mongoose');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');
const GoldLog = require('./models/GoldLog');

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

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const currentWeek = getCurrentWeek();
    console.log('当前周:', currentWeek);

    // 直接查询本周的领取记录
    const claim15 = await WeeklyBonusClaim.findOne({
      employeeId: '2222',
      week: '2026-15'
    });
    console.log('\n查询 week=2026-15, employeeId=2222:', claim15 ? '找到' : '未找到');

    // 查询第16周的领取记录
    const claim16 = await WeeklyBonusClaim.findOne({
      employeeId: '2222',
      week: '2026-16'
    });
    console.log('查询 week=2026-16, employeeId=2222:', claim16 ? '找到' : '未找到');

    // 用currentWeek查询
    const claimCurrent = await WeeklyBonusClaim.findOne({
      employeeId: '2222',
      week: currentWeek
    });
    console.log(`查询 week=${currentWeek}, employeeId=2222:`, claimCurrent ? '找到' : '未找到');

    // 用字符串拼接查询
    const claimStr = await WeeklyBonusClaim.findOne({
      employeeId: '2222',
      week: String(currentWeek)
    });
    console.log(`查询 week=${String(currentWeek)}, employeeId=2222:`, claimStr ? '找到' : '未找到');

    // 检查GoldLog本周数据
    function getWeekRange(week) {
      const [year, weekNumber] = week.split('-').map(Number);
      const firstDayOfYear = new Date(year, 0, 1);
      const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
      const daysToFirstMonday = (8 - dayOfWeek) % 7;
      const firstMonday = new Date(firstDayOfYear);
      firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);

      const weekStart = new Date(firstMonday);
      weekStart.setDate(weekStart.getDate() + (weekNumber - 1) * 7);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      weekEnd.setHours(0, 0, 0, 0);

      return {
        start: new Date(weekStart.getTime() - 8 * 60 * 60 * 1000),
        end: new Date(weekEnd.getTime() - 8 * 60 * 60 * 1000)
      };
    }

    const weekRange = getWeekRange(currentWeek);
    const count = await GoldLog.countDocuments({
      employeeId: '2222',
      createTime: { $gte: weekRange.start, $lt: weekRange.end }
    });
    console.log('\n本周GoldLog记录数:', count);
    console.log('本周开始(UTC):', weekRange.start.toISOString());
    console.log('本周结束(UTC):', weekRange.end.toISOString());

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });