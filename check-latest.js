const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017').then(async () => {
  console.log('MongoDB连接成功\n');

  // 查询最新的5条记录
  const latestLogs = await GoldLog.find({}).sort({ createTime: -1 }).limit(5);
  console.log('数据库中最新的5条记录:');
  latestLogs.forEach(log => {
    const beijingTime = new Date(log.createTime.getTime() + 8*60*60*1000);
    console.log(`  UTC: ${log.createTime.toISOString()}, 北京: ${beijingTime.toISOString()}, 员工: ${log.employeeId}`);
  });

  // 查询最早的5条记录
  const earliestLogs = await GoldLog.find({}).sort({ createTime: 1 }).limit(5);
  console.log('\n数据库中最旧的5条记录:');
  earliestLogs.forEach(log => {
    const beijingTime = new Date(log.createTime.getTime() + 8*60*60*1000);
    console.log(`  UTC: ${log.createTime.toISOString()}, 北京: ${beijingTime.toISOString()}, 员工: ${log.employeeId}`);
  });

  // 统计4月20日的记录
  const apr20Start = new Date(Date.UTC(2026, 3, 20, 0, 0, 0));
  const apr20Logs = await GoldLog.find({ createTime: { $gte: apr20Start } });
  console.log('\n4月20日的记录数:', apr20Logs.length);

  mongoose.connection.close();
}).catch(err => console.error(err));