const mongoose = require('mongoose');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const week15Count = await WeeklyBonusClaim.countDocuments({ week: '2026-15' });
    const week16Count = await WeeklyBonusClaim.countDocuments({ week: '2026-16' });

    console.log('第15周记录数:', week15Count);
    console.log('第16周记录数:', week16Count);

    // 如果第15周还有记录，说明没有全部改成16周
    if (week15Count > 0) {
      const claims15 = await WeeklyBonusClaim.find({ week: '2026-15' });
      console.log('\n第15周记录:');
      claims15.forEach(c => {
        console.log(`  员工 ${c.employeeId}: bonusGold=${c.bonusGold}, claimedAt=${c.claimedAt.toISOString()}`);
      });
    }

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });