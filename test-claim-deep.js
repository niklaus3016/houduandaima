const mongoose = require('mongoose');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    // 查看2222的领取记录详情
    const claim = await WeeklyBonusClaim.findOne({ employeeId: '2222', week: '2026-16' });
    console.log('\n=== 领取记录详情 ===');
    console.log('_id:', claim._id);
    console.log('week:', claim.week);
    console.log('userId:', claim.userId);
    console.log('employeeId:', claim.employeeId);
    console.log('bonusGold:', claim.bonusGold);
    console.log('createdAt:', claim.createdAt);
    console.log('updatedAt:', claim.updatedAt);
    console.log('\n完整文档:', JSON.stringify(claim, null, 2));

    // 检查WeekBonusClaim模型结构
    console.log('\n=== WeekBonusClaim Schema信息 ===');
    const schema = WeeklyBonusClaim.schema;
    console.log('paths:', Object.keys(schema.paths));

    // 检查week字段类型
    console.log('\nweek字段类型:', schema.paths.week);

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });