const mongoose = require('mongoose');
const Alert = require('./models/Alert');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 检查预警数据 ===');
  
  const alerts = await Alert.find({}).sort({ createdAt: -1 });
  
  console.log(`找到 ${alerts.length} 条预警记录`);
  
  if (alerts.length > 0) {
    console.log('\n预警数据:');
    alerts.forEach(alert => {
      console.log(`\nID: ${alert._id}`);
      console.log(`类型: ${alert.type}`);
      console.log(`状态: ${alert.status}`);
      console.log(`内容: ${alert.content}`);
      console.log(`创建时间: ${alert.createdAt}`);
    });
  } else {
    console.log('数据库中没有预警数据');
  }
  
  mongoose.disconnect();
});