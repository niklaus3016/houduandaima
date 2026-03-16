const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 删除ECPM > 1000的记录 ===');
  
  // 计算三天前的时间（北京时间）
  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  
  const threeDaysAgoBeijing = new Date(beijingNow);
  threeDaysAgoBeijing.setDate(threeDaysAgoBeijing.getDate() - 3);
  threeDaysAgoBeijing.setHours(0, 0, 0, 0);
  const threeDaysAgo = new Date(threeDaysAgoBeijing.getTime() - 8 * 60 * 60 * 1000);
  
  console.log('删除时间范围:', threeDaysAgo.toISOString(), '至', now.toISOString());
  
  // 先查询记录数量
  const countBefore = await GoldLog.countDocuments({
    ecpm: { $gt: 1000 },
    createTime: { $gte: threeDaysAgo }
  });
  
  console.log(`\n删除前记录数: ${countBefore}`);
  
  // 删除记录
  const result = await GoldLog.deleteMany({
    ecpm: { $gt: 1000 },
    createTime: { $gte: threeDaysAgo }
  });
  
  console.log(`删除后结果: ${result.deletedCount} 条记录被删除`);
  
  // 验证删除结果
  const countAfter = await GoldLog.countDocuments({
    ecpm: { $gt: 1000 },
    createTime: { $gte: threeDaysAgo }
  });
  
  console.log(`删除后剩余记录数: ${countAfter}`);
  
  // 显示删除摘要
  console.log('\n=== 删除摘要 ===');
  console.log(`共删除 ${result.deletedCount} 条ECPM > 1000的记录`);
  console.log(`删除前: ${countBefore} 条`);
  console.log(`删除后: ${countAfter} 条`);
  
  mongoose.disconnect();
});