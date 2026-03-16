const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 获取北京时间
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

// 获取北京时间的当天开始（返回北京时间0点）
function getBeijingStartOfDay() {
  const beijingNow = getBeijingDate();
  const startOfDay = new Date(beijingNow);
  startOfDay.setHours(0, 0, 0, 0);
  return startOfDay;
}

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    console.log('=== 查询2222今天的金币记录 ===\n');
    
    const todayStart = getBeijingStartOfDay();
    console.log(`- 今日开始时间: ${todayStart.toISOString()}`);
    
    const todayGoldLogs = await GoldLog.find({
      employeeId: '2222',
      createTime: { $gte: todayStart }
    });
    
    console.log(`- 今日金币记录数: ${todayGoldLogs.length}`);
    
    if (todayGoldLogs.length > 0) {
      const todayRevenue = todayGoldLogs.reduce((sum, log) => sum + log.gold, 0);
      console.log(`- 今日总收益（金币）: ${todayRevenue}`);
      console.log(`- 今日总收益（元）: ${(todayRevenue / 1000).toFixed(2)}`);
      
      console.log('\n=== 今天的金币记录 ===');
      todayGoldLogs.forEach((log, index) => {
        console.log(`\n记录 ${index + 1}:`);
        console.log(`- 用户ID: ${log.userId}`);
        console.log(`- 员工ID: ${log.employeeId}`);
        console.log(`- ECPM: ${log.ecpm}`);
        console.log(`- 金币: ${log.gold}`);
        console.log(`- 广告位ID: ${log.slotId || '无'}`);
        console.log(`- 时间: ${log.createTime.toISOString()}`);
      });
    } else {
      console.log('- 今日总收益（金币）: 0');
      console.log('- 今日总收益（元）: 0.00');
    }
    
    mongoose.disconnect();
    console.log('\n操作完成');
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    mongoose.disconnect();
  });
