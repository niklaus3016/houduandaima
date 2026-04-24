const mongoose = require('mongoose');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    // 第一步：把所有第15周记录改成第16周
    const claims15 = await WeeklyBonusClaim.find({ week: '2026-15' });
    console.log('\n=== 第一步：将所有第15周记录改为第16周 ===');
    console.log('第15周记录数:', claims15.length);

    for (const claim of claims15) {
      console.log(`员工 ${claim.employeeId}: ${claim.week} -> 2026-16`);
      claim.week = '2026-16';
      await claim.save();
    }

    console.log('\n修改完成');

    // 第二步：检查第16周哪些人有2次或多次领取
    console.log('\n\n=== 第二步：检查第16周重复领取 ===');

    const claims16 = await WeeklyBonusClaim.find({ week: '2026-16' }).sort({ employeeId: 1 });

    // 按员工分组
    const byEmployee = {};
    claims16.forEach(c => {
      if (!byEmployee[c.employeeId]) {
        byEmployee[c.employeeId] = [];
      }
      byEmployee[c.employeeId].push({
        _id: c._id,
        bonusGold: c.bonusGold,
        claimedAt: c.claimedAt
      });
    });

    // 找出有2次或多次领取的用户
    console.log('\n第16周重复领取用户:');
    let dupCount = 0;
    for (const empId of Object.keys(byEmployee).sort()) {
      if (byEmployee[empId].length >= 2) {
        dupCount++;
        console.log(`\n员工 ${empId} (${byEmployee[empId].length}次):`);
        byEmployee[empId].forEach((c, i) => {
          console.log(`  第${i+1}次: bonusGold=${c.bonusGold}, claimedAt=${c.claimedAt.toISOString()}, _id=${c._id}`);
        });
      }
    }

    console.log(`\n重复领取用户数: ${dupCount}`);

    // 统计第16周总记录数
    const total16 = await WeeklyBonusClaim.countDocuments({ week: '2026-16' });
    console.log(`第16周总记录数: ${total16}`);

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });