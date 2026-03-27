const mongoose = require('mongoose');

// 连接数据库
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
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
  
  // 获取当前时间
  const now = new Date();
  console.log('当前时间:', now);
  
  // 更新所有有效奖券的有效期为当前时间
  const result = await LotteryTicket.updateMany(
    { status: '有效' },
    { $set: { validUntil: now } }
  );
  
  console.log(`更新成功，共更新 ${result.modifiedCount} 张奖券`);
  
  // 关闭数据库连接
  mongoose.connection.close();
}).catch(error => {
  console.error('操作出错:', error);
  mongoose.connection.close();
});
