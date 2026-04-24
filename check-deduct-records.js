const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const dupUsers = ['3236', '4860', '5555', '6205', '8886'];

    console.log('\n=== 检查这5个用户的金币扣除记录 ===');

    for (const empId of dupUsers) {
      console.log(`\n--- 员工 ${empId} ---`);

      // 查找是否有负数金币记录
      const negativeLogs = await GoldLog.find({
        employeeId: empId,
        gold: { $lt: 0 }
      }).sort({ createTime: -1 });

      if (negativeLogs.length > 0) {
        console.log('负数金币记录:');
        negativeLogs.forEach(log => {
          console.log(`  gold=${log.gold}, createTime=${log.createTime.toISOString()}, type=${log.type}`);
        });
      } else {
        console.log('无负数金币记录');
      }

      // 查找是否有type包含deduct/扣除/bonus等关键词的记录
      const allLogs = await GoldLog.find({
        employeeId: empId,
        type: { $in: ['deduct', 'bonus_deduct', 'weekly_bonus_refund', 'refund'] }
      }).sort({ createTime: -1 });

      if (allLogs.length > 0) {
        console.log('扣除相关记录:');
        allLogs.forEach(log => {
          console.log(`  gold=${log.gold}, type=${log.type}, createTime=${log.createTime.toISOString()}`);
        });
      } else {
        console.log('无扣除相关记录');
      }

      // 显示所有28888金币的记录
      const bonusLogs = await GoldLog.find({
        employeeId: empId,
        gold: 28888
      }).sort({ createTime: -1 });

      console.log(`28888金币记录数: ${bonusLogs.length}`);
      if (bonusLogs.length > 0) {
        bonusLogs.forEach(log => {
          console.log(`  gold=${log.gold}, type=${log.type}, createTime=${log.createTime.toISOString()}`);
        });
      }
    }

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });