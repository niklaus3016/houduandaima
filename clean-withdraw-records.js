const mongoose = require('mongoose');
const WithdrawRecord = require('./models/WithdrawRecord');

// 数据库连接字符串
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 连接数据库
mongoose.connect(MONGODB_URI).then(() => {
  console.log('数据库连接成功');
  
  // 删除测试提现记录
  WithdrawRecord.deleteMany({
    employeeId: { $in: ['2222', '7777', '8202'] }
  }).then(result => {
    console.log(`已删除 ${result.deletedCount} 条测试提现记录`);
    
    // 验证删除结果
    WithdrawRecord.find({}).then(remainingRecords => {
      console.log('剩余提现记录:');
      remainingRecords.forEach(record => {
        console.log(`员工ID: ${record.employeeId}, 金额: ${record.amount}, 状态: ${record.status}`);
      });
      mongoose.connection.close();
    });
  }).catch(err => {
    console.error('删除提现记录错误:', err);
    mongoose.connection.close();
  });
}).catch(err => {
  console.error('数据库连接错误:', err);
});