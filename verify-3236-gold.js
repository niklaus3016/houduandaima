const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');
const UserGold = require('./models/UserGold');

async function verify3236Gold() {
  try {
    await mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017');
    console.log('MongoDB连接成功');
    
    // 获取本月开始和结束时间
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    
    console.log('本月开始时间:', monthStart);
    console.log('本月结束时间:', monthEnd);
    
    // 查询3236用户本月的GoldLog记录
    const logs = await GoldLog.find({ 
      employeeId: '3236', 
      createTime: { $gte: monthStart, $lte: monthEnd } 
    });
    
    // 计算本月金币总和
    const totalGold = logs.reduce((sum, log) => sum + log.gold, 0);
    console.log('\n3236用户本月金币总和 (从GoldLog计算):', totalGold);
    console.log('金币记录数量:', logs.length);
    
    // 检查是否有周奖励记录
    const bonusLogs = logs.filter(log => log.type === 'weekly_bonus');
    console.log('\n周奖励记录数量:', bonusLogs.length);
    bonusLogs.forEach(log => {
      console.log(`周奖励: ${log.gold} 金币, 时间: ${log.createTime}`);
    });
    
    // 查询UserGold记录
    const userGold = await UserGold.findOne({ employeeId: '3236' });
    if (userGold) {
      console.log('\n3236用户的UserGold记录:');
      console.log('currentMonthGold:', userGold.currentMonthGold);
      console.log('lastMonthGold:', userGold.lastMonthGold);
      
      // 比较两个值
      const difference = Math.abs(totalGold - userGold.currentMonthGold);
      console.log('\n差异:', difference);
      if (difference < 0.0001) {
        console.log('✅ 数据一致，GoldLog和UserGold中的金币数量匹配');
      } else {
        console.log('❌ 数据不一致，GoldLog和UserGold中的金币数量不匹配');
      }
    } else {
      console.log('\n❌ 未找到3236用户的UserGold记录');
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('验证过程中出错:', error);
    await mongoose.connection.close();
  }
}

verify3236Gold();