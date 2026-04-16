const mongoose = require('mongoose');
const WelfareWallet = require('./models/WelfareWallet');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function addChancesToWallet() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');
    
    // 查找员工号1111的福利钱包
    let wallet = await WelfareWallet.findOne({ employeeId: '1111' });
    
    if (!wallet) {
      // 如果钱包不存在，创建一个新的
      wallet = new WelfareWallet({
        userId: '1',
        employeeId: '1111',
        balance: 0,
        chances: 10
      });
      await wallet.save();
      console.log('✅ 创建新的福利钱包并添加10次抽奖机会');
    } else {
      // 如果钱包存在，更新抽奖机会
      wallet.chances += 10;
      wallet.updatedAt = new Date();
      await wallet.save();
      console.log('✅ 已为员工号1111的福利钱包增加10次抽奖机会');
    }
    
    // 查询更新后的钱包信息
    const updatedWallet = await WelfareWallet.findOne({ employeeId: '1111' });
    console.log('\n更新后的福利钱包信息:');
    console.log(`用户ID: ${updatedWallet.userId}`);
    console.log(`员工号: ${updatedWallet.employeeId}`);
    console.log(`余额: ${updatedWallet.balance}元`);
    console.log(`抽奖机会: ${updatedWallet.chances}次`);
    
    process.exit(0);
  } catch (error) {
    console.error('操作错误:', error);
    process.exit(1);
  }
}

addChancesToWallet();
