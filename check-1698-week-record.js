const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const empId = '1698';

    // 本周开始时间（北京时间4月13日0点 = UTC 4月12日16点）
    const weekStartUTC = new Date('2026-04-12T16:00:00.000Z');

    console.log(`\n=== 员工 ${empId} 本周收益记录 ===`);
    console.log(`本周开始时间（UTC）: ${weekStartUTC.toISOString()}`);

    // 统计本周金币记录数
    const count = await GoldLog.countDocuments({
      employeeId: empId,
      createTime: { $gte: weekStartUTC }
    });

    console.log(`本周金币记录数: ${count}`);

    // 如果不够3500条，说明是错误领取
    if (count < 3500) {
      console.log(`\n❌ 本周记录数 ${count} < 3500，领取异常！`);
    } else {
      console.log(`\n✅ 本周记录数 ${count} >= 3500，符合条件`);
    }

    // 也查一下今日领取记录
    const todayStart = new Date('2026-04-18T16:00:00.000Z');
    const todayCount = await GoldLog.countDocuments({
      employeeId: empId,
      createTime: { $gte: todayStart }
    });
    console.log(`\n今日金币记录数: ${todayCount}`);

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });