const mongoose = require('mongoose');
const SystemConfig = require('./models/SystemConfig');

// 连接数据库
mongoose.connect('mongodb://127.0.0.1:27017/ad-monetization', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('MongoDB 连接成功');
  checkWithdrawConfig();
}).catch((error) => {
  console.error('MongoDB 连接失败:', error);
  process.exit(1);
});

// 检查提现开关配置
async function checkWithdrawConfig() {
  try {
    const config = await SystemConfig.findOne({ key: 'withdraw_enabled' });
    console.log('提现开关配置:', config);
    
    if (config) {
      console.log('配置值类型:', typeof config.value);
      console.log('配置值:', config.value);
      
      // 测试修复后的逻辑
      let withdrawEnabled = true;
      if (config) {
        if (typeof config.value === 'boolean') {
          withdrawEnabled = config.value;
        } else if (typeof config.value === 'object' && config.value !== null) {
          withdrawEnabled = config.value.enabled !== false;
        }
      }
      console.log('修复后逻辑计算的开关状态:', withdrawEnabled);
    } else {
      console.log('配置不存在，默认开启');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('检查配置错误:', error);
    process.exit(1);
  }
}