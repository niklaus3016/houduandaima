const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 添加索引 ===');
  
  const db = mongoose.connection;
  const goldLogCollection = db.collection('goldlogs');
  
  // 添加 userId + deviceId + createTime 索引
  try {
    await goldLogCollection.createIndex(
      { userId: 1, deviceId: 1, createTime: -1 },
      { name: 'userId_deviceId_createTime_idx' }
    );
    console.log('✅ 添加了 userId + deviceId + createTime 索引');
  } catch (error) {
    if (error.code === 85) {
      console.log('ℹ️ userId + deviceId + createTime 索引已存在');
    } else {
      console.error('❌ 添加索引失败:', error.message);
    }
  }
  
  // 查看所有索引
  const indexes = await goldLogCollection.indexes();
  console.log('\n当前索引:');
  indexes.forEach(idx => {
    console.log('-', idx.name, ':', idx.key);
  });
  
  mongoose.disconnect();
  console.log('\n索引添加完成！');
});