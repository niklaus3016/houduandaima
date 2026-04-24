const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const empId = '1698';

    // 本周开始时间
    const weekStartUTC = new Date('2026-04-12T16:00:00.000Z');

    // 领取时间
    const claimTimeUTC = new Date('2026-04-18T17:48:36.050Z');

    console.log(`\n=== 员工 ${empId} 领取时检查 ===`);
    console.log(`领取时间: ${claimTimeUTC.toISOString()}`);

    // 统计领取前的记录数
    const countBefore = await GoldLog.countDocuments({
      employeeId: empId,
      createTime: { $gte: weekStartUTC, $lt: claimTimeUTC }
    });

    console.log(`领取前记录数: ${countBefore}`);

    // 领取后的记录数
    const countAfter = await GoldLog.countDocuments({
      employeeId: empId,
      createTime: { $gte: weekStartUTC }
    });

    console.log(`现在记录数: ${countAfter}`);

    if (countBefore < 3500) {
      console.log(`\n❌ 领取时记录数不足! 领取前=${countBefore}, 现在=${countAfter}`);
    } else {
      console.log(`\n✅ 领取时记录数已满足条件`);
    }

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });