const mongoose = require('mongoose');
const WeeklyTarget = require('./models/WeeklyTarget');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    // 查询第16周目标
    const target16 = await WeeklyTarget.findOne({ week: '2026-16' });
    console.log('\n=== 第16周目标设置 ===');
    if (target16) {
      console.log(`周数: ${target16.week}`);
      console.log(`目标条数: ${target16.targetCount}`);
      console.log(`奖励金币: ${target16.bonusGold}`);
    } else {
      console.log('第16周目标未设置');
    }

    // 查询所有周目标
    const allTargets = await WeeklyTarget.find({}).sort({ week: 1 });
    console.log('\n=== 所有周目标 ===');
    allTargets.forEach(t => {
      console.log(`第${t.week}周: 目标=${t.targetCount}, 奖励=${t.bonusGold}`);
    });

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });