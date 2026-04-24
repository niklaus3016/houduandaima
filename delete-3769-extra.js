const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const empId = '3769';

    console.log(`\n=== 重新删除员工 ${empId} 的4月18日28888记录 ===`);

    // 查找4月18日的28888记录
    const logs = await GoldLog.find({
      employeeId: empId,
      gold: 28888,
      type: 'weekly_bonus'
    }).sort({ createTime: -1 });

    console.log(`找到${logs.length}条记录:`);
    logs.forEach((log, i) => {
      console.log(`${i+1}. createTime=${log.createTime.toISOString()}, _id=${log._id}`);
    });

    // 删除4月18日的记录（createTime >= 2026-04-18T16:00:00.000Z）
    const result = await GoldLog.deleteMany({
      employeeId: empId,
      gold: 28888,
      type: 'weekly_bonus',
      createTime: { $gte: new Date('2026-04-18T16:00:00.000Z') }
    });

    console.log(`\n删除结果: deletedCount=${result.deletedCount}`);

    // 验证
    const remaining = await GoldLog.countDocuments({
      employeeId: empId,
      gold: 28888,
      type: 'weekly_bonus'
    });
    console.log(`剩余28888记录数: ${remaining}`);

    // 显示剩余记录
    const remainingLogs = await GoldLog.find({
      employeeId: empId,
      gold: 28888,
      type: 'weekly_bonus'
    }).sort({ createTime: -1 });
    console.log('\n剩余记录:');
    remainingLogs.forEach((log, i) => {
      console.log(`${i+1}. createTime=${log.createTime.toISOString()}`);
    });

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });