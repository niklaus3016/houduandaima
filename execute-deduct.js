const mongoose = require('mongoose');
const UserGold = require('./models/UserGold');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const dupUsers = ['3236', '4860', '5555', '6205', '8886'];
    const deductAmount = 28888;

    console.log('\n=== 执行金币扣除操作 ===');

    for (const empId of dupUsers) {
      console.log(`\n--- 处理员工 ${empId} ---`);

      // 1. 从UserGold中扣除金币
      const userGold = await UserGold.findOne({ employeeId: empId });
      if (userGold) {
        console.log(`扣除前 currentMonthGold: ${userGold.currentMonthGold.toFixed(2)}`);
        userGold.currentMonthGold -= deductAmount;
        await userGold.save();
        console.log(`扣除后 currentMonthGold: ${userGold.currentMonthGold.toFixed(2)}`);
      } else {
        console.log('未找到UserGold记录');
        continue;
      }

      // 2. 删除其中一条28888的GoldLog记录（删除较早的那条）
      const bonusLogs = await GoldLog.find({
        employeeId: empId,
        gold: 28888,
        type: 'weekly_bonus'
      }).sort({ createTime: 1 }); // 按时间升序，最早的排前面

      if (bonusLogs.length >= 2) {
        // 删除第一条（较早的）
        const toDelete = bonusLogs[0];
        console.log(`删除GoldLog记录: _id=${toDelete._id}, gold=${toDelete.gold}, createTime=${toDelete.createTime.toISOString()}`);
        await GoldLog.deleteOne({ _id: toDelete._id });
        console.log('删除成功');
      } else {
        console.log(`注意: 28888记录只有${bonusLogs.length}条，不需要删除`);
      }
    }

    console.log('\n\n=== 扣除完成，验证结果 ===');

    for (const empId of dupUsers) {
      const ug = await UserGold.findOne({ employeeId: empId });
      const bonusCount = await GoldLog.countDocuments({
        employeeId: empId,
        gold: 28888,
        type: 'weekly_bonus'
      });

      console.log(`员工 ${empId}: currentMonthGold=${ug.currentMonthGold.toFixed(2)}, 28888记录数=${bonusCount}`);
    }

    mongoose.disconnect();
    console.log('\n操作完成');
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });