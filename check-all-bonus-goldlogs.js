const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    console.log('=== 查询所有领取周奖励的用户 ===');
    const allClaims = await WeeklyBonusClaim.find({}).sort({ employeeId: 1 });
    console.log(`总领取记录数: ${allClaims.length}`);

    const usersWithIssues = [];
    const usersWithCorrect = [];

    for (const claim of allClaims) {
      const { employeeId, bonusGold, week } = claim;

      const goldLogs = await GoldLog.find({
        employeeId: employeeId,
        gold: bonusGold,
        type: 'weekly_bonus'
      });

      if (goldLogs.length === 1) {
        usersWithCorrect.push(employeeId);
      } else {
        usersWithIssues.push({
          employeeId,
          week,
          bonusGold,
          goldLogCount: goldLogs.length
        });
      }
    }

    console.log(`\n=== 正常用户 (只有1条记录): ${usersWithCorrect.length} 个 ===`);
    console.log(usersWithCorrect.join(', '));

    console.log(`\n=== 有问题的用户 (非1条记录): ${usersWithIssues.length} 个 ===`);
    usersWithIssues.forEach(issue => {
      console.log(`用户 ${issue.employeeId} - 第${issue.week}周 - ${issue.bonusGold}金币 - GoldLog记录数: ${issue.goldLogCount}`);
    });

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });