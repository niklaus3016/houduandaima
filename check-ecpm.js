const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    const goldLogs = await GoldLog.find({});
    
    console.log('\n所有金币记录数:', goldLogs.length);
    
    if (goldLogs.length > 0) {
      console.log('\n金币记录详情:');
      let totalEcpm = 0;
      goldLogs.forEach((log, index) => {
        console.log(`  ${index + 1}. userId: ${log.userId}, ecpm: ${log.ecpm}, gold: ${log.gold}, createTime: ${log.createTime}`);
        totalEcpm += log.ecpm || 0;
      });
      
      const avgEcpm = totalEcpm / goldLogs.length;
      console.log('\n统计:');
      console.log('  ecpm总和:', totalEcpm);
      console.log('  记录数:', goldLogs.length);
      console.log('  平均ecpm:', avgEcpm.toFixed(2));
    }
    
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    process.exit(1);
  });