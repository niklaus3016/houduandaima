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
    return new Date(Date.UTC(year, month, day, 0, 0, 0) - 8 * 60 * 60 * 1000);
  }

  function getYesterdayStart(beijingTime) {
    const todayStart = getBeijingStartOfDay(beijingTime);
    return new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  }

  const now = new Date();
  const beijingNow = getBeijingDate();
  const beijingHour = beijingNow.getUTCHours();

  let todayStart;
  if (beijingHour < 12) {
    todayStart = getYesterdayStart(beijingNow);
  } else {
    todayStart = getBeijingStartOfDay(beijingNow);
  }

  console.log('当前UTC时间:', now.toISOString());
  console.log('计算的北京时间:', beijingNow.toISOString());
  console.log('北京时间年月日:', beijingNow.getFullYear(), beijingNow.getMonth() + 1, beijingNow.getDate());
  console.log('北京时间小时:', beijingNow.getHours());
  console.log('计算的今日开始时间:', todayStart.toISOString());

  // 测试日期格式化
  const testDate = getBeijingDate(new Date());
  console.log('\n测试日期格式化:');
  console.log('使用getFullYear():', testDate.getFullYear(), testDate.getMonth() + 1, testDate.getDate());
  console.log('使用getUTCFullYear():', testDate.getUTCFullYear(), testDate.getUTCMonth() + 1, testDate.getUTCDate());

  // 查询今日记录
  const todayLogs = await GoldLog.find({ createTime: { $gte: todayStart } });
  console.log('\n今日记录数:', todayLogs.length);

  if (todayLogs.length > 0) {
    const firstLog = todayLogs[0];
    const lastLog = todayLogs[todayLogs.length - 1];
    console.log('第一条记录时间:', getBeijingDate(firstLog.createTime).toISOString());
    console.log('最后一条记录时间:', getBeijingDate(lastLog.createTime).toISOString());
  }

  mongoose.connection.close();
}).catch(err => console.error(err));