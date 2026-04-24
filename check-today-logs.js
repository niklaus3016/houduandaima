const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017').then(async () => {
  console.log('MongoDB连接成功\n');

  // 北京时间4月19日开始的UTC时间
  const beijing19Start = new Date(Date.UTC(2026, 3, 19, 0, 0, 0)); // UTC 2026-04-19 00:00
  console.log('北京时间4月19日开始的UTC时间:', beijing19Start.toISOString());

  const logs = await GoldLog.find({ createTime: { $gte: beijing19Start } });
  console.log('4月19日的记录数:', logs.length);

  // 按员工分组统计
  const byEmployee = {};
  logs.forEach(log => {
    if (!byEmployee[log.employeeId]) {
      byEmployee[log.employeeId] = { count: 0, totalGold: 0 };
    }
    byEmployee[log.employeeId].count++;
    byEmployee[log.employeeId].totalGold += log.gold;
  });

  console.log('\n各员工记录:');
  for (const empId of Object.keys(byEmployee)) {
    const stats = byEmployee[empId];
    console.log(`  员工${empId}: ${stats.count}条, 总金币${stats.totalGold}`);
  }

  console.log('\n总计:', logs.length, '条记录');

  mongoose.connection.close();
}).catch(err => console.error(err));