const mongoose = require('mongoose');
const SystemConfig = require('./models/SystemConfig');

// 连接MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function testRedPacketInit() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');
    
    // 删除现有配置
    await SystemConfig.deleteOne({ key: 'redPacketPool' });
    console.log('已删除现有红包池配置');
    
    // 模拟获取红包池余额的逻辑
    let redPacketPool = await SystemConfig.findOne({ key: 'redPacketPool' });
    console.log('查找后:', redPacketPool);
    
    if (!redPacketPool) {
      redPacketPool = new SystemConfig({ key: 'redPacketPool', value: 1000 });
      await redPacketPool.save();
      console.log('创建新配置:', redPacketPool);
    }
    
    // 再次查找
    const updatedRedPacketPool = await SystemConfig.findOne({ key: 'redPacketPool' });
    console.log('最终配置:', updatedRedPacketPool);
    
    mongoose.disconnect();
  } catch (error) {
    console.error('测试失败:', error);
    mongoose.disconnect();
  }
}

testRedPacketInit();