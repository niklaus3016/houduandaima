const mongoose = require('mongoose');
const SystemConfig = require('./models/SystemConfig');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function getRedPacketInjectRate() {
  console.log('========================================');
  console.log('查询红包池注入百分比');
  console.log('========================================');
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');
    
    // 查询红包池注入比例
    const injectRateConfig = await SystemConfig.findOne({ key: 'redPacketInjectRate' });
    
    if (injectRateConfig) {
      console.log('✅ 红包池注入百分比:', (injectRateConfig.value * 100).toFixed(2) + '%');
    } else {
      console.log('⚠️  未找到红包池注入比例配置，使用默认值');
      console.log('✅ 红包池注入百分比:', '2.50% (默认值)');
    }
    
    // 同时查询红包池余额
    const redPacketPoolConfig = await SystemConfig.findOne({ key: 'redPacketPool' });
    if (redPacketPoolConfig) {
      console.log('✅ 红包池余额:', redPacketPoolConfig.value, '元');
    } else {
      console.log('⚠️  未找到红包池余额配置');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ 查询错误:', error.message);
    process.exit(1);
  }
}

getRedPacketInjectRate();
