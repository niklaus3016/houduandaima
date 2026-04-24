const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017').then(async () => {
  console.log('MongoDB连接成功\n');

  function getBeijingDate(date = new Date()) {
    return new Date(date.getTime() + 8 * 60 * 60 * 1000);
  }

  function getBeijingStartOfDay(beijingTime) {
    const year = beijingTime.getUTCFullYear();
    const month = beijingTime.getUTCMonth();
    const day = beijingTime.getUTCDate();
    return new Date(Date.UTC(year, month, day, 0, 0, 0));
  }

  const now = new Date();
  const beijingNow = getBeijingDate();
  const todayStart = getBeijingStartOfDay(beijingNow);

  console.log('当前UTC时间:', now.toISOString());
  console.log('计算的北京时间:', beijingNow.toISOString());
  console.log('计算的今日开始时间(UTC):', todayStart.toISOString());

  // 查询今日记录
  const todayLogs = await GoldLog.find({ createTime: { $gte: todayStart } });
  console.log('\n今日(4月20日)的记录数:', todayLogs.length);

  if (todayLogs.length > 0) {
    console.log('前5条记录:');
    todayLogs.slice(0, 5).forEach(log => {
      console.log(`  UTC: ${log.createTime.toISOString()}, 北京: ${new Date(log.createTime.getTime() + 8*60*60*1000).toISOString()}, 员工: ${log.employeeId}`);
    });
  }

  mongoose.connection.close();
}).catch(err => console.error(err));