const mongoose = require('mongoose');
const LotteryTicket = require('./models/LotteryTicket');
const LotteryHistory = require('./models/LotteryHistory');
const UserGold = require('./models/UserGold');

// 数据库连接
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    try {
      // 查找8202用户的所有奖券
      const userId = 'user_8202_1772466028893';
      console.log('\n=== 8202用户的奖券列表 ===');
      const tickets = await LotteryTicket.find({ userId }).sort({ createdAt: -1 });
      
      if (tickets.length === 0) {
        console.log('该用户没有奖券');
      } else {
        tickets.forEach((ticket, index) => {
          console.log(`\n奖券 ${index + 1}:`);
          console.log(`  奖券号码: ${ticket.ticketNumber}`);
          console.log(`  期号: ${ticket.issueNumber}`);
          console.log(`  状态: ${ticket.status}`);
          console.log(`  有效期: ${ticket.validUntil}`);
          console.log(`  创建时间: ${ticket.createdAt}`);
        });
      }
      
      // 查找最近的开奖记录
      console.log('\n=== 最近的开奖记录 ===');
      const history = await LotteryHistory.find().sort({ drawTime: -1 }).limit(5);
      
      if (history.length === 0) {
        console.log('暂无开奖记录');
      } else {
        history.forEach((record, index) => {
          console.log(`\n开奖记录 ${index + 1}:`);
          console.log(`  期号: ${record.issueNumber}`);
          console.log(`  开奖时间: ${record.drawTime}`);
          console.log(`  奖金池金额: ${record.poolAmount}`);
          console.log(`  开奖类型: ${record.drawType}`);
          console.log(`  一等奖: ${record.winners.firstPrize.length}人`);
          console.log(`  二等奖: ${record.winners.secondPrize.length}人`);
          console.log(`  三等奖: ${record.winners.thirdPrize.length}人`);
        });
      }
      
      // 检查用户金币余额
      console.log('\n=== 用户金币余额 ===');
      const userGold = await UserGold.findOne({ userId });
      if (userGold) {
        console.log(`当前金币: ${userGold.currentMonthGold}`);
        console.log(`上月金币: ${userGold.lastMonthGold}`);
      } else {
        console.log('该用户没有金币记录');
      }
      
    } catch (error) {
      console.error('查询错误:', error);
    } finally {
      mongoose.disconnect();
      console.log('\nMongoDB连接已关闭');
    }
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
  });
