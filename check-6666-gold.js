const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 检查6666的记录 ===');
  
  // 1. 查看所有6666的记录
  const allLogs = await GoldLog.find({ employeeId: '6666' });
  console.log('所有记录数:', allLogs.length);
  
  if (allLogs.length > 0) {
    console.log('记录详情:');
    for (const log of allLogs) {
      console.log('- 时间:', log.createTime, '金币:', log.gold, 'ECPM:', log.ecpm);
    }
  }
  
  // 2. 检查本月时间范围
  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  
  const firstDayOfMonthBeijing = new Date(beijingNow);
  firstDayOfMonthBeijing.setUTCDate(1);
  firstDayOfMonthBeijing.setUTCHours(0, 0, 0, 0);
  const startDate = new Date(firstDayOfMonthBeijing.getTime() - 8 * 60 * 60 * 1000);
  
  console.log('\n本月开始时间:', startDate);
  console.log('当前时间:', now);
  
  // 3. 重新查询本月记录
  const monthLogs = await GoldLog.find({ 
    employeeId: '6666', 
    createTime: { $gte: startDate } 
  });
  
  console.log('\n本月记录数:', monthLogs.length);
  
  let totalGold = 0;
  for (const log of monthLogs) {
    totalGold += log.gold;
  }
  console.log('本月累计金币:', totalGold);
  
  mongoose.disconnect();
});