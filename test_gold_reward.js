const mongoose = require('mongoose');
const SystemConfig = require('./models/SystemConfig');

async function main() {
  const MONGO = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
  await mongoose.connect(MONGO);
  
  console.log('=== 检查 commissionRate 配置 ===');
  const config = await SystemConfig.findOne({ key: 'commissionRate' });
  console.log('commissionRate 配置:', config);
  console.log('实际值:', config?.value);
  
  console.log('\n=== 检查所有系统配置 ===');
  const allConfigs = await SystemConfig.find().lean();
  for (const c of allConfigs) {
    console.log(`${c.key}: ${c.value}`);
  }
  
  await mongoose.disconnect();
}

main().catch(e => console.error(e));
