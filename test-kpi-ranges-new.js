const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 获取北京时间
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    const beijingNow = getBeijingDate();
    console.log('当前北京时间:', beijingNow.toISOString());
    
    // 测试 range=lastMonth（使用新逻辑）
    console.log('\n=== 测试 range=lastMonth（新逻辑）===');
    const currentMonth = beijingNow.getUTCMonth();
    const currentYear = beijingNow.getUTCFullYear();
    
    // 上月1日北京时间0点对应的UTC时间
    const lastMonthStartBeijing = new Date(Date.UTC(currentYear, currentMonth - 1, 1, 0, 0, 0));
    const startDate = new Date(lastMonthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    // 本月1日北京时间0点对应的UTC时间（上月结束时间）
    const thisMonthStartBeijing = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0));
    const endDate = new Date(thisMonthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    console.log('上月开始时间:', startDate.toISOString());
    console.log('上月结束时间:', endDate.toISOString());
    
    const lastMonthGoldLogs = await GoldLog.find({
      createTime: { $gte: startDate, $lt: endDate }
    });
    
    console.log('上月金币记录数:', lastMonthGoldLogs.length);
    if (lastMonthGoldLogs.length > 0) {
      const lastMonthRevenue = lastMonthGoldLogs.reduce((sum, log) => sum + log.gold, 0);
      console.log('上月总收益（金币）:', lastMonthRevenue);
      console.log('上月总收益（元）:', (lastMonthRevenue / 1000).toFixed(2));
    }
    
    // 测试 range=all（使用新逻辑）
    console.log('\n=== 测试 range=all（新逻辑）===');
    const startDateAll = new Date(0);
    const endDateAll = new Date();
    
    console.log('累计开始时间:', startDateAll.toISOString());
    console.log('累计结束时间:', endDateAll.toISOString());
    
    const allGoldLogs = await GoldLog.find({
      createTime: { $gte: startDateAll, $lt: endDateAll }
    });
    
    console.log('累计金币记录数:', allGoldLogs.length);
    if (allGoldLogs.length > 0) {
      const allRevenue = allGoldLogs.reduce((sum, log) => sum + log.gold, 0);
      console.log('累计总收益（金币）:', allRevenue);
      console.log('累计总收益（元）:', (allRevenue / 1000).toFixed(2));
    }
    
    mongoose.disconnect();
    console.log('\n操作完成');
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    mongoose.disconnect();
  });
