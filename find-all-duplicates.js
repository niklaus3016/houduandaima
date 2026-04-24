const mongoose = require('mongoose');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');
const UserGold = require('./models/UserGold');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    // 查询5555的所有领取记录
    const claims = await WeeklyBonusClaim.find({ employeeId: '5555' })
      .sort({ week: 1 });

    console.log('\n=== 员工5555的所有领取记录 ===');
    console.log('总记录数:', claims.length);

    claims.forEach((claim, index) => {
      console.log(`\n记录 ${index + 1}:`);
      console.log(`  week: ${claim.week}`);
      console.log(`  bonusGold: ${claim.bonusGold}`);
      console.log(`  claimedAt: ${claim.claimedAt}`);
    });

    // 查询所有周数
    console.log('\n\n=== 所有周数统计 ===');
    const allWeeks = await WeeklyBonusClaim.distinct('week');
    console.log('所有周数:', allWeeks.sort());

    // 统计每周领取人数
    for (const week of allWeeks.sort()) {
      const count = await WeeklyBonusClaim.countDocuments({ week });
      console.log(`第${week}周: ${count}人`);
    }

    // 找出重复领取的用户
    console.log('\n\n=== 重复领取的用户 ===');
    const allClaims = await WeeklyBonusClaim.find({}).sort({ employeeId: 1, week: 1 });

    const userClaims = {};
    allClaims.forEach(claim => {
      if (!userClaims[claim.employeeId]) {
        userClaims[claim.employeeId] = [];
      }
      userClaims[claim.employeeId].push({
        week: claim.week,
        bonusGold: claim.bonusGold,
        claimedAt: claim.claimedAt
      });
    });

    for (const employeeId of Object.keys(userClaims)) {
      if (userClaims[employeeId].length > 1) {
        console.log(`\n员工 ${employeeId}:`);
        userClaims[employeeId].forEach((c, i) => {
          console.log(`  第${c.week}周: bonusGold=${c.bonusGold}, claimedAt=${c.claimedAt}`);
        });
      }
    }

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });