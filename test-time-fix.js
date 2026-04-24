const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017').then(async () => {
  console.log('MongoDB连接成功\n');

  // 测试当前时间
  const now = new Date();
  console.log('当前UTC时间:', now.toISOString());
  
  function getBeijingDate(date = new Date()) {
    return new Date(date.getTime() + 8 * 60 * 60 * 1000);
  }

  function getBeijingStartOfDay(beijingTime) {
    const startOfDay = new Date(beijingTime);
    startOfDay.setUTCHours(0, 0, 0, 0);
    return new Date(startOfDay.getTime() - 8 * 60 * 60 * 1000);
  }

  function getBeijingEndOfDay(beijingTime) {
    const endOfDay = new Date(beijingTime);
    endOfDay.setUTCHours(23, 59, 59, 999);
    return new Date(endOfDay.getTime() - 8 * 60 * 60 * 1000);
  }

  const beijingNow = getBeijingDate(now);
  const todayStart = getBeijingStartOfDay(beijingNow);
  const todayEnd = getBeijingEndOfDay(beijingNow);

  console.log('当前北京时间:', beijingNow.toISOString());
  console.log('今日开始(UTC):', todayStart.toISOString());
  console.log('今日开始(北京):', getBeijingDate(todayStart).toISOString());
  console.log('今日结束(UTC):', todayEnd.toISOString());
  console.log('今日结束(北京):', getBeijingDate(todayEnd).toISOString());

  // 查询7703员工的记录
  const logs = await GoldLog.find({
    employeeId: '7703',
    createTime: { $gte: todayStart, $lt: todayEnd }
  });

  console.log('\n7703员工今日记录数:', logs.length);

  if (logs.length > 0) {
    // 按小时统计
    const hourStats = {};
    logs.forEach(log => {
      const beijingTime = getBeijingDate(log.createTime);
      const hour = beijingTime.getHours();
      if (!hourStats[hour]) hourStats[hour] = 0;
      hourStats[hour]++;
    });

    console.log('\n按北京时间小时统计:');
    Object.keys(hourStats).sort().forEach(hour => {
      console.log(`  ${hour}:00 - ${hourStats[hour]}条`);
    });
  }

  mongoose.connection.close();
}).catch(err => console.error(err));