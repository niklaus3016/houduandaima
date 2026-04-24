const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const empId = '3769';

    // 今日开始时间（北京时间4月19日00:00:00）
    const todayStartUTC = new Date('2026-04-18T16:00:00.000Z');

    console.log(`\n=== 员工 ${empId} 今日金币记录 ===`);
    console.log('今日开始时间（UTC）:', todayStartUTC.toISOString());

    // 查找今日所有28888金币记录
    const logs = await GoldLog.find({
      employeeId: empId,
      gold: 28888,
      createTime: { $gte: todayStartUTC }
    }).sort({ createTime: -1 });

    console.log(`\n今日28888金币记录数: ${logs.length}`);
    logs.forEach((log, i) => {
      console.log(`${i+1}. gold=${log.gold}, type=${log.type}, createTime=${log.createTime.toISOString()}`);
    });

    // 也查一下所有大于0的金币记录总数
    const allLogs = await GoldLog.find({
      employeeId: empId,
      createTime: { $gte: todayStartUTC }
    }).sort({ createTime: -1 });

    console.log(`\n今日所有金币记录数: ${allLogs.length}`);
    const totalGold = allLogs.reduce((sum, log) => sum + log.gold, 0);
    console.log(`今日金币总额: ${totalGold.toFixed(2)}`);

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });