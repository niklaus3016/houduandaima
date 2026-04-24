const mongoose = require('mongoose');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    // 把所有第16周记录改成第15周
    const claims16 = await WeeklyBonusClaim.find({ week: '2026-16' });
    console.log('\n第16周记录数:', claims16.length);

    console.log('\n=== 开始修改 ===');
    for (const claim of claims16) {
      console.log(`员工 ${claim.employeeId}: 2026-16 -> 2026-15`);
      claim.week = '2026-15';
      await claim.save();
    }

    // 验证
    const week15Count = await WeeklyBonusClaim.countDocuments({ week: '2026-15' });
    const week16Count = await WeeklyBonusClaim.countDocuments({ week: '2026-16' });

    console.log('\n=== 修改结果 ===');
    console.log('第15周记录数:', week15Count);
    console.log('第16周记录数:', week16Count);

    // 显示第15周所有记录
    const claims15 = await WeeklyBonusClaim.find({ week: '2026-15' }).sort({ employeeId: 1 });
    console.log('\n第15周所有记录:');
    claims15.forEach(c => {
      console.log(`  员工 ${c.employeeId}: bonusGold=${c.bonusGold}, claimedAt=${c.claimedAt.toISOString()}`);
    });

    mongoose.disconnect();
    console.log('\n完成');
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });