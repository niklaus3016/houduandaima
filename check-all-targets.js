const mongoose = require('mongoose');
const WeeklyTarget = require('./models/WeeklyTarget');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const all = await WeeklyTarget.find({}).sort({ week: 1 });
    console.log('\n=== 数据库中所有周目标 ===');
    all.forEach(t => {
      console.log(`week: ${t.week}, targetCount: ${t.targetCount}, bonusGold: ${t.bonusGold}`);
    });

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });