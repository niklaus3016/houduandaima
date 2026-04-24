const mongoose = require('mongoose');
const Verification = require('./models/Verification');

// 数据库连接字符串
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 连接数据库
mongoose.connect(MONGODB_URI).then(() => {
  console.log('数据库连接成功');
  
  // 删除员工1111的所有核销记录
  Verification.deleteMany({
    employeeId: '1111'
  }).then(result => {
    console.log(`已删除 ${result.deletedCount} 条员工1111的核销记录`);
    
    // 验证删除结果
    Verification.find({
      status: { $in: ['approved', 'rejected'] }
    }).then(remainingRecords => {
      console.log('剩余已处理核销记录:');
      remainingRecords.forEach(record => {
        console.log(`员工ID: ${record.employeeId}, 金额: ${record.amount}, 状态: ${record.status}`);
      });
      mongoose.connection.close();
    });
  }).catch(err => {
    console.error('删除核销记录错误:', err);
    mongoose.connection.close();
  });
}).catch(err => {
  console.error('数据库连接错误:', err);
});