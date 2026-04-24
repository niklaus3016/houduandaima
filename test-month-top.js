const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017').then(async () => {
  console.log('MongoDB连接成功\n');

  function getBeijingDate(date = new Date()) {
    return new Date(date.getTime() + 8 * 60 * 60 * 1000);
  }

  function getBeijingStartOfMonth(beijingTime) {
    const year = beijingTime.getUTCFullYear();
    const month = beijingTime.getUTCMonth();
    return new Date(Date.UTC(year, month, 1, 0, 0, 0) - 8 * 60 * 60 * 1000);
  }

  const beijingNow = getBeijingDate();
  const monthStart = getBeijingStartOfMonth(beijingNow);

  console.log('本月开始时间:', monthStart.toISOString());
  console.log('本月开始北京时间:', getBeijingDate(monthStart).toISOString());

  const monthGoldLogs = await GoldLog.find({ createTime: { $gte: monthStart } });
  console.log('本月记录数:', monthGoldLogs.length);

  const dailyStats = {};
  monthGoldLogs.forEach(log => {
    const beijingTime = getBeijingDate(log.createTime);
    const dateKey = `${beijingTime.getFullYear()}-${String(beijingTime.getMonth() + 1).padStart(2, '0')}-${String(beijingTime.getDate()).padStart(2, '0')}`;

    if (!dailyStats[dateKey]) {
      dailyStats[dateKey] = {};
    }
    if (!dailyStats[dateKey][log.employeeId]) {
      dailyStats[dateKey][log.employeeId] = {
        totalGold: 0,
        count: 0
      };
    }
    dailyStats[dateKey][log.employeeId].totalGold += log.gold;
    dailyStats[dateKey][log.employeeId].count += 1;
  });

  console.log('\n每日最高收益:');
  for (const dateKey of Object.keys(dailyStats)) {
    let maxEarnings = 0;
    let maxEmployee = null;
    
    for (const employeeId of Object.keys(dailyStats[dateKey])) {
      const earnings = dailyStats[dateKey][employeeId].totalGold / 1000;
      if (earnings > maxEarnings) {
        maxEarnings = earnings;
        maxEmployee = employeeId;
      }
    }
    
    console.log(`${dateKey}: 员工${maxEmployee} - ${maxEarnings.toFixed(3)}元`);
  }

  // 找到本月最高
  let topDaily = null;
  let maxEarnings = 0;

  for (const dateKey of Object.keys(dailyStats)) {
    for (const employeeId of Object.keys(dailyStats[dateKey])) {
      const earnings = dailyStats[dateKey][employeeId].totalGold / 1000;
      if (earnings > maxEarnings) {
        maxEarnings = earnings;
        topDaily = {
          date: dateKey,
          employeeId: employeeId,
          earnings: parseFloat(earnings.toFixed(3)),
          count: dailyStats[dateKey][employeeId].count,
          avgGold: parseFloat((dailyStats[dateKey][employeeId].totalGold / dailyStats[dateKey][employeeId].count).toFixed(2))
        };
      }
    }
  }

  console.log('\n本月最高:');
  console.log(topDaily);

  mongoose.connection.close();
}).catch(err => console.error(err));