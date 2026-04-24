const mongoose = require('mongoose');
const WeeklyTarget = require('./models/WeeklyTarget');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const target16 = await WeeklyTarget.findOne({ week: '2026-16' });
    console.log('\n=== 数据库中第16周目标 ===');
    if (target16) {
      console.log(`week: ${target16.week}`);
      console.log(`targetCount: ${target16.targetCount}`);
      console.log(`bonusGold: ${target16.bonusGold}`);
    } else {
      console.log('第16周目标不存在');
    }

    // 查询所有周目标
    const all = await WeeklyTarget.find({}).sort({ week: 1 });
    console.log('\n=== 所有周目标 ===');
    all.forEach(t => {
      console.log(`第${t.week}周: targetCount=${t.targetCount}, bonusGold=${t.bonusGold}`);
    });

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });