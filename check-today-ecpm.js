const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    
    console.log('\n查询时间范围:');
    console.log('  开始:', today.toISOString());
    console.log('  结束:', todayEnd.toISOString());
    
    const todayLogs = await GoldLog.find({
      createTime: { $gte: today, $lte: todayEnd }
    });
    
    console.log('\n今日金币记录数:', todayLogs.length);
    
    if (todayLogs.length > 0) {
      console.log('\n今日金币记录详情:');
      let totalEcpm = 0;
      todayLogs.forEach((log, index) => {
        console.log(`  ${index + 1}. userId: ${log.userId}, ecpm: ${log.ecpm}, gold: ${log.gold}, createTime: ${log.createTime}`);
        totalEcpm += log.ecpm || 0;
      });
      
      const avgEcpm = totalEcpm / todayLogs.length;
      console.log('\n今日统计:');
      console.log('  ecpm总和:', totalEcpm);
      console.log('  记录数:', todayLogs.length);
      console.log('  平均ecpm:', avgEcpm.toFixed(2));
    }
    
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    process.exit(1);
  });