const mongoose = require('mongoose');
const WelfareWallet = require('./models/WelfareWallet');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkAlipayData() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');
    
    // 查询所有福利钱包记录
    const wallets = await WelfareWallet.find();
    console.log('\n福利钱包记录数量:', wallets.length);
    
    if (wallets.length > 0) {
      console.log('\n福利钱包详情:');
      wallets.forEach(wallet => {
        console.log(`用户ID: ${wallet.userId}, 员工号: ${wallet.employeeId}, 余额: ${wallet.balance}, 抽奖机会: ${wallet.chances}`);
      });
    }
    
    // 查询最近创建的记录
    const recentWallets = await WelfareWallet.find()
      .sort({ createdAt: -1 })
      .limit(5);
    
    if (recentWallets.length > 0) {
      console.log('\n最近创建的福利钱包记录:');
      recentWallets.forEach(wallet => {
        console.log(`用户ID: ${wallet.userId}, 员工号: ${wallet.employeeId}, 余额: ${wallet.balance}, 抽奖机会: ${wallet.chances}, 创建时间: ${wallet.createdAt}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('查询错误:', error);
    process.exit(1);
  }
}

checkAlipayData();
