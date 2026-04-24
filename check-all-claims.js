const mongoose = require('mongoose');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    // 查询所有领取记录
    const allClaims = await WeeklyBonusClaim.find({}).sort({ employeeId: 1, week: 1 });

    console.log('\n=== 所有领取记录 ===');
    console.log('总记录数:', allClaims.length);

    // 按员工分组
    const byEmployee = {};
    allClaims.forEach(claim => {
      if (!byEmployee[claim.employeeId]) {
        byEmployee[claim.employeeId] = [];
      }
      byEmployee[claim.employeeId].push({
        week: claim.week,
        bonusGold: claim.bonusGold,
        claimedAt: claim.claimedAt
      });
    });

    // 显示有多次领取的用户
    console.log('\n\n=== 有多次领取的用户 ===');
    let multiCount = 0;
    for (const empId of Object.keys(byEmployee)) {
      if (byEmployee[empId].length > 1) {
        multiCount++;
        console.log(`\n员工 ${empId}:`);
        byEmployee[empId].forEach((c, i) => {
          console.log(`  第${c.week}周: bonusGold=${c.bonusGold}, claimedAt=${c.claimedAt}`);
        });
      }
    }

    if (multiCount === 0) {
      console.log('没有重复领取的用户');
    }

    // 统计每周记录数
    console.log('\n\n=== 每周统计 ===');
    const weeks = [...new Set(allClaims.map(c => c.week))];
    for (const week of weeks.sort()) {
      const count = await WeeklyBonusClaim.countDocuments({ week });
      console.log(`第${week}周: ${count}条记录`);
    }

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });