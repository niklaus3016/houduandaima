const mongoose = require('mongoose');

// 连接数据库
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 不指定dbName，使用默认数据库（和app.js保持一致）
mongoose.connect(MONGODB_URI).then(() => {
  console.log('数据库连接成功');
  
  // 定义临时的LotteryTicket模型
  const lotteryTicketSchema = new mongoose.Schema({
    ticketNumber: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    employeeId: { type: String, required: true },
    status: { type: String, required: true, default: '有效' },
    issueNumber: { type: String, required: true },
    validUntil: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now }
  });
  
  const LotteryTicket = mongoose.model('LotteryTicket', lotteryTicketSchema);
  
  // 先查询奖券数量
  LotteryTicket.countDocuments({}).then(count => {
    console.log(`当前奖券数量: ${count}`);
    
    // 删除所有奖券
    return LotteryTicket.deleteMany({});
  }).then(result => {
    console.log(`删除成功，共删除 ${result.deletedCount} 张奖券`);
    
    // 再次查询奖券数量
    return LotteryTicket.countDocuments({});
  }).then(count => {
    console.log(`删除后奖券数量: ${count}`);
    
    // 关闭数据库连接
    mongoose.connection.close();
  }).catch(error => {
    console.error('操作出错:', error);
    mongoose.connection.close();
  });
}).catch(error => {
  console.error('数据库连接失败:', error);
});
