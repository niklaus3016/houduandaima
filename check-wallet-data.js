const mongoose = require('mongoose');
const WelfareWallet = require('./models/WelfareWallet');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkWalletData() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');
    
    // 查询所有福利钱包记录
    const wallets = await WelfareWallet.find();
    
    console.log('\n福利钱包记录数量:', wallets.length);
    
    if (wallets.length > 0) {
      console.log('\n福利钱包详情:');
      wallets.forEach(wallet => {
        console.log(`用户ID: ${wallet.userId} (类型: ${typeof wallet.userId})`);
        console.log(`员工号: ${wallet.employeeId} (类型: ${typeof wallet.employeeId})`);
        console.log(`余额: ${wallet.balance}`);
        console.log(`抽奖机会: ${wallet.chances}`);
        console.log('---');
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('查询错误:', error);
    process.exit(1);
  }
}

checkWalletData();
