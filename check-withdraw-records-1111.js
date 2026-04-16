const mongoose = require('mongoose');
const WelfareWithdraw = require('./models/WelfareWithdraw');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkWithdrawRecords() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');
    
    // 查询员工号1111的提现记录
    const records = await WelfareWithdraw.find({ employeeId: '1111' })
      .sort({ createdAt: -1 });
    
    console.log('\n员工号1111的提现记录数量:', records.length);
    
    if (records.length > 0) {
      console.log('\n提现记录详情:');
      records.forEach((record, index) => {
        console.log(`\n记录 ${index + 1}:`);
        console.log(`  提现ID: ${record._id}`);
        console.log(`  用户ID: ${record.userId}`);
        console.log(`  员工号: ${record.employeeId}`);
        console.log(`  提现金额: ${record.amount}`);
        console.log(`  支付宝账号: ${record.alipayAccount}`);
        console.log(`  支付宝姓名: ${record.alipayName}`);
        console.log(`  状态: ${record.status}`);
        console.log(`  创建时间: ${record.createdAt}`);
      });
    } else {
      console.log('\n没有找到员工号1111的提现记录');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('查询错误:', error);
    process.exit(1);
  }
}

checkWithdrawRecords();
