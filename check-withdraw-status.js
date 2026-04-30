const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkWithdrawStatus() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('已连接到MongoDB');

    const SystemConfig = require('./models/SystemConfig');

    const config = await SystemConfig.findOne({ key: 'withdraw_enabled' });

    if (config) {
      console.log('\n=== 提现开关状态 ===');
      console.log(`状态: ${config.value.enabled ? '开启 ✅' : '关闭 ❌'}`);
      console.log(`消息: ${config.value.message || '无'}`);
      console.log(`更新时间: ${config.updatedAt || '未知'}`);
    } else {
      console.log('提现开关配置不存在');
    }

    const oldConfig = await SystemConfig.findOne({ key: 'withdrawEnabled' });
    if (oldConfig) {
      console.log('\n=== 旧配置 withdrawEnabled ===');
      console.log(`状态: ${oldConfig.value ? '开启' : '关闭'}`);
    }

    await mongoose.connection.close();
    console.log('\n连接已关闭');
  } catch (error) {
    console.error('查询失败:', error);
    process.exit(1);
  }
}

checkWithdrawStatus();