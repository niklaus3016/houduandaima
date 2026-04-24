const mongoose = require('mongoose');
const Verification = require('./models/Verification');

// 连接数据库
mongoose.connect('mongodb://localhost:27017/your-database-name', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('数据库连接成功');
  
  // 保留的员工ID
  const keepEmployeeIds = ['2777', '4860', '5555'];
  
  // 删除非保留员工的已处理核销记录
  Verification.deleteMany({
    employeeId: { $nin: keepEmployeeIds },
    status: { $in: ['approved', 'rejected'] }
  }).then(result => {
    console.log(`已删除 ${result.deletedCount} 条测试核销记录`);
    
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