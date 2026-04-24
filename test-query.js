const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017').then(async () => {
  console.log('MongoDB连接成功\n');

  // 直接用日期字符串查询
  const apr20Start = new Date('2026-04-20T00:00:00.000Z');
  console.log('查询起始时间:', apr20Start.toISOString());

  const todayLogs = await GoldLog.find({ createTime: { $gte: apr20Start } });
  console.log('4月20日的记录数:', todayLogs.length);

  if (todayLogs.length > 0) {
    console.log('前5条记录:');
    todayLogs.slice(0, 5).forEach(log => {
      console.log(`  ${log.createTime.toISOString()} - 员工: ${log.employeeId}`);
    });
  }

  // 也试试用今天凌晨12点查
  const todayStart2 = new Date();
  todayStart2.setUTCHours(16, 0, 0, 0); // 北京时间16点 = UTC 8点?
  console.log('\n当前UTC时间:', new Date().toISOString());

  // 直接用 Date.UTC
  const apr20Start3 = new Date(Date.UTC(2026, 3, 20, 0, 0, 0));
  console.log('Date.UTC(2026, 3, 20, 0, 0, 0):', apr20Start3.toISOString());

  const todayLogs3 = await GoldLog.find({ createTime: { $gte: apr20Start3 } });
  console.log('使用Date.UTC查询4月20日的记录数:', todayLogs3.length);

  mongoose.connection.close();
}).catch(err => console.error(err));