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
    
    // 测试 range=lastMonth
    console.log('\n=== 测试 range=lastMonth ===');
    const firstDayOfLastMonthBeijing = new Date(beijingNow);
    firstDayOfLastMonthBeijing.setUTCMonth(firstDayOfLastMonthBeijing.getUTCMonth() - 1);
    firstDayOfLastMonthBeijing.setUTCDate(1);
    firstDayOfLastMonthBeijing.setUTCHours(0, 0, 0, 0);
    const startDate = new Date(firstDayOfLastMonthBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    const lastDayOfLastMonthBeijing = new Date(beijingNow);
    lastDayOfLastMonthBeijing.setUTCDate(0);
    lastDayOfLastMonthBeijing.setUTCHours(23, 59, 59, 999);
    const endDate = new Date(lastDayOfLastMonthBeijing.getTime() - 8 * 60 * 60 * 1000);
    
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
    
    // 测试 range=all
    console.log('\n=== 测试 range=all ===');
    const allGoldLogs = await GoldLog.find({});
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
