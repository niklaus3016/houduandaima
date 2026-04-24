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

  const now = new Date();
  const beijingNow = getBeijingDate();
  const todayStart = getBeijingStartOfDay(beijingNow);

  console.log('当前UTC时间:', now.toISOString());
  console.log('计算的北京时间:', beijingNow.toISOString());
  console.log('计算的今日开始时间:', todayStart.toISOString());
  console.log('今日开始时间对应的北京时间:', getBeijingDate(todayStart).toISOString());

  // 查询今日记录
  const todayLogs = await GoldLog.find({ createTime: { $gte: todayStart } });
  console.log('\n今日记录数:', todayLogs.length);

  // 统计记录的时间范围
  if (todayLogs.length > 0) {
    const times = todayLogs.map(log => log.createTime.getTime());
    const minTime = new Date(Math.min(...times));
    const maxTime = new Date(Math.max(...times));
    
    console.log('最早记录UTC时间:', minTime.toISOString());
    console.log('最早记录北京时间:', getBeijingDate(minTime).toISOString());
    console.log('最晚记录UTC时间:', maxTime.toISOString());
    console.log('最晚记录北京时间:', getBeijingDate(maxTime).toISOString());
  }

  // 测试本月单日最高
  const monthStart = new Date(Date.UTC(2026, 3, 1, 0, 0, 0) - 8 * 60 * 60 * 1000);
  const monthLogs = await GoldLog.find({ createTime: { $gte: monthStart } });
  
  const dailyStats = {};
  monthLogs.forEach(log => {
    const beijingTime = getBeijingDate(log.createTime);
    const dateKey = `${beijingTime.getFullYear()}-${String(beijingTime.getMonth() + 1).padStart(2, '0')}-${String(beijingTime.getDate()).padStart(2, '0')}`;
    
    if (!dailyStats[dateKey]) {
      dailyStats[dateKey] = {};
    }
    if (!dailyStats[dateKey][log.employeeId]) {
      dailyStats[dateKey][log.employeeId] = { totalGold: 0, count: 0 };
    }
    dailyStats[dateKey][log.employeeId].totalGold += log.gold;
    dailyStats[dateKey][log.employeeId].count++;
  });

  console.log('\n本月按日期统计:');
  Object.keys(dailyStats).sort().forEach(date => {
    const employees = Object.keys(dailyStats[date]);
    const totalEarnings = employees.reduce((sum, emp) => sum + dailyStats[date][emp].totalGold, 0);
    console.log(`${date}: ${employees.length}个员工, 总收益${(totalEarnings/1000).toFixed(3)}元`);
  });

  mongoose.connection.close();
}).catch(err => console.error(err));