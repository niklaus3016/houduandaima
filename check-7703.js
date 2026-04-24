const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017').then(async () => {
  console.log('MongoDB连接成功\n');

  // 查询7703员工的所有记录
  const logs = await GoldLog.find({ employeeId: '7703' }).sort({ createTime: -1 }).limit(50);
  console.log('7703员工最近50条记录:');
  logs.forEach(log => {
    const beijingTime = new Date(log.createTime.getTime() + 8*60*60*1000);
    console.log(`  UTC: ${log.createTime.toISOString()}, 北京: ${beijingTime.toISOString()}, 金币: ${log.gold}`);
  });

  // 统计4月20日的记录
  const apr20Start = new Date(Date.UTC(2026, 3, 20, 0, 0, 0));
  const apr20Logs = await GoldLog.find({
    employeeId: '7703',
    createTime: { $gte: apr20Start }
  });
  console.log('\n7703员工4月20日的记录数:', apr20Logs.length);
  apr20Logs.forEach(log => {
    const beijingTime = new Date(log.createTime.getTime() + 8*60*60*1000);
    console.log(`  ${beijingTime.toISOString()} - ${log.gold}`);
  });

  mongoose.connection.close();
}).catch(err => console.error(err));