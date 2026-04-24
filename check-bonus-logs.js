const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    // 5个重复领取的用户
    const dupUsers = ['3236', '4860', '5555', '6205', '8886'];

    // 今日开始时间（北京时间）
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartUTC = new Date(todayStart.getTime() - 8 * 60 * 60 * 1000);

    console.log('\n=== 今日金币收益记录查询 ===');
    console.log('查询时间范围: ', todayStartUTC.toISOString(), ' 至 现在');

    for (const empId of dupUsers) {
      console.log(`\n--- 员工 ${empId} ---`);

      // 查询今日所有记录
      const todayLogs = await GoldLog.find({
        employeeId: empId,
        createTime: { $gte: todayStartUTC }
      }).sort({ createTime: -1 });

      console.log(`今日记录数: ${todayLogs.length}`);

      // 查找是否有28888金币的记录
      const bonusLogs = todayLogs.filter(log => log.gold === 28888);
      console.log(`28888金币记录数: ${bonusLogs.length}`);

      if (bonusLogs.length > 0) {
        bonusLogs.forEach((log, i) => {
          console.log(`  记录${i+1}: gold=${log.gold}, createTime=${log.createTime.toISOString()}, type=${log.type}`);
        });
      }

      // 也查询一下金币=28888的所有记录（不限时间）
      const allBonusLogs = await GoldLog.find({
        employeeId: empId,
        gold: 28888
      }).sort({ createTime: -1 });

      console.log(`历史28888金币记录数: ${allBonusLogs.length}`);
      if (allBonusLogs.length > 0) {
        console.log(`  最近一条: createTime=${allBonusLogs[0].createTime.toISOString()}`);
      }
    }

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });