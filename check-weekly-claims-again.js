const mongoose = require('mongoose');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const dupUsers = ['3236', '4860', '5555', '6205', '8886'];

    console.log('\n=== 检查WeeklyBonusClaim记录 ===');

    for (const empId of dupUsers) {
      const claims = await WeeklyBonusClaim.find({ employeeId: empId }).sort({ week: 1 });
      console.log(`\n员工 ${empId}:`);
      console.log(`  领取记录数: ${claims.length}`);
      claims.forEach(c => {
        console.log(`  第${c.week}周: bonusGold=${c.bonusGold}, claimedAt=${c.claimedAt}`);
      });
    }

    // 也检查一下总记录数
    const total = await WeeklyBonusClaim.countDocuments({});
    console.log(`\n\nWeeklyBonusClaim总记录数: ${total}`);

    // 按周统计
    const weeks = await WeeklyBonusClaim.distinct('week');
    console.log('所有周数:', weeks);
    for (const week of weeks) {
      const count = await WeeklyBonusClaim.countDocuments({ week });
      console.log(`第${week}周: ${count}条`);
    }

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });