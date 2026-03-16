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
    
    console.log('=== 检查2222的金币记录时间范围 ===\n');
    
    const todayStart = getBeijingStartOfDay();
    console.log(`- 今日开始时间: ${todayStart.toISOString()}`);
    console.log(`- 今日开始时间（北京时间）: ${todayStart.getTime() + 8 * 60 * 60 * 1000}`);
    
    const goldLogs = await GoldLog.find({ employeeId: '2222' }).sort({ createTime: 1 });
    
    if (goldLogs.length > 0) {
      console.log(`\n=== 金币记录时间范围 ===`);
      console.log(`- 最早记录: ${goldLogs[0].createTime.toISOString()}`);
      console.log(`- 最晚记录: ${goldLogs[goldLogs.length - 1].createTime.toISOString()}`);
      
      const todayGoldLogs = await GoldLog.find({
        employeeId: '2222',
        createTime: { $gte: todayStart }
      });
      
      console.log(`\n=== 今日金币记录 ===`);
      console.log(`- 今日金币记录数: ${todayGoldLogs.length}`);
      console.log(`- 总金币记录数: ${goldLogs.length}`);
      
      if (todayGoldLogs.length > 0) {
        const todayRevenue = todayGoldLogs.reduce((sum, log) => sum + log.gold, 0);
        console.log(`- 今日总收益（金币）: ${todayRevenue}`);
        console.log(`- 今日总收益（元）: ${(todayRevenue / 1000).toFixed(2)}`);
      }
    } else {
      console.log('暂无金币记录');
    }
    
    mongoose.disconnect();
    console.log('\n操作完成');
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    mongoose.disconnect();
  });
