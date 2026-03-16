const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    const employeeIds = ['8202', '2222'];
    
    console.log('=== 查询金币日志记录 ===\n');
    
    for (const employeeId of employeeIds) {
      console.log(`=== 员工 ${employeeId} 的金币记录 ===`);
      
      const logs = await GoldLog.find({ employeeId: employeeId })
        .sort({ createTime: -1 })
        .limit(5); // 只显示最近5条记录
      
      if (logs.length > 0) {
        logs.forEach((log, index) => {
          console.log(`\n记录 ${index + 1}:`);
          console.log(`- 用户ID: ${log.userId}`);
          console.log(`- 员工ID: ${log.employeeId}`);
          console.log(`- ECPM: ${log.ecpm}`);
          console.log(`- 金币: ${log.gold}`);
          console.log(`- 广告位ID: ${log.slotId || '无'}`);
          console.log(`- 时间: ${log.createTime.toISOString()}`);
        });
      } else {
        console.log('暂无金币记录');
      }
      
      console.log('\n' + '='.repeat(40) + '\n');
    }
    
    mongoose.disconnect();
    console.log('操作完成');
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    mongoose.disconnect();
  });
