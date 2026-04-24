const mongoose = require('mongoose');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const week15Count = await WeeklyBonusClaim.countDocuments({ week: '2026-15' });
    const week16Count = await WeeklyBonusClaim.countDocuments({ week: '2026-16' });

    console.log('\n=== 周奖励领取记录统计 ===');
    console.log(`第15周记录数: ${week15Count}`);
    console.log(`第16周记录数: ${week16Count}`);

    if (week16Count > 0) {
      console.log('\n❌ 第16周还有记录!');
      const claims16 = await WeeklyBonusClaim.find({ week: '2026-16' }).sort({ employeeId: 1 });
      claims16.forEach(c => {
        console.log(`  员工 ${c.employeeId}: bonusGold=${c.bonusGold}, claimedAt=${c.claimedAt.toISOString()}`);
      });
    } else {
      console.log('\n✅ 第16周无记录');
    }

    if (week15Count > 0) {
      console.log('\n=== 第15周所有记录 ===');
      const claims15 = await WeeklyBonusClaim.find({ week: '2026-15' }).sort({ employeeId: 1 });
      claims15.forEach(c => {
        console.log(`  员工 ${c.employeeId}: bonusGold=${c.bonusGold}, claimedAt=${c.claimedAt.toISOString()}`);
      });

      // 检查是否有重复领取的用户
      const byEmployee = {};
      claims15.forEach(c => {
        if (!byEmployee[c.employeeId]) byEmployee[c.employeeId] = 0;
        byEmployee[c.employeeId]++;
      });

      console.log('\n=== 重复领取检查 ===');
      let hasDuplicates = false;
      for (const empId of Object.keys(byEmployee).sort()) {
        if (byEmployee[empId] > 1) {
          console.log(`  员工 ${empId}: ${byEmployee[empId]}条 (重复!)`);
          hasDuplicates = true;
        }
      }
      if (!hasDuplicates) {
        console.log('  ✅ 无重复领取');
      }
    }

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });