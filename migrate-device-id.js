const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 数据迁移：为历史记录添加默认 deviceId ===');
  
  // 为历史记录添加默认 deviceId
  const result = await GoldLog.updateMany(
    { deviceId: { $exists: false } },
    { $set: { deviceId: "unknown_device" } }
  );
  
  console.log('迁移结果:');
  console.log('更新记录数:', result.modifiedCount);
  console.log('匹配记录数:', result.matchedCount);
  console.log('未修改记录数:', result.upsertedCount);
  
  // 验证迁移结果
  const count = await GoldLog.countDocuments({ deviceId: "unknown_device" });
  console.log('\n验证结果:');
  console.log('使用默认 deviceId 的记录数:', count);
  
  // 检查是否还有缺少 deviceId 的记录
  const missingCount = await GoldLog.countDocuments({ deviceId: { $exists: false } });
  console.log('缺少 deviceId 的记录数:', missingCount);
  
  mongoose.disconnect();
  console.log('\n数据迁移完成！');
});