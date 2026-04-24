const mongoose = require('mongoose');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');
const UserGold = require('./models/UserGold');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    // 检查当前周数（用代码里的逻辑）
    const now = new Date();
    const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const year = beijingNow.getFullYear();
    const firstDayOfYear = new Date(year, 0, 1);
    const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
    const daysToFirstMonday = (8 - dayOfWeek) % 7;
    const firstMonday = new Date(firstDayOfYear);
    firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);
    const diffTime = beijingNow - firstMonday;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const weekNumber = Math.floor(diffDays / 7) + 1;
    const currentWeek = `${year}-${weekNumber.toString().padStart(2, '0')}`;

    console.log('当前周数:', currentWeek);
    console.log('北京时间:', beijingNow.toISOString());

    // 查询第16周所有记录
    const claims16 = await WeeklyBonusClaim.find({ week: '2026-16' }).sort({ employeeId: 1 });
    console.log('\n第16周领取记录 (共', claims16.length, '条):');
    claims16.forEach(c => {
      console.log(`  员工 ${c.employeeId}: bonusGold=${c.bonusGold}, claimedAt=${c.claimedAt.toISOString()}`);
    });

    // 检查几个用户是否还能领取
    const users = ['2222', '3236', '4860', '5555', '6205', '8886', '3769', '5366'];
    console.log('\n=== 用户领取状态检查 ===');
    for (const empId of users) {
      const claimed = await WeeklyBonusClaim.findOne({ employeeId: empId, week: '2026-16' });
      const ug = await UserGold.findOne({ employeeId: empId });
      console.log(`员工 ${empId}: currentMonthGold=${ug?.currentMonthGold?.toFixed(2) || 'N/A'}, 第16周领取=${claimed ? '已领取' : '未领取'}`);
    }

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });