const mongoose = require('mongoose');
const Team = require('./models/Team');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 获取北京时间
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

// 获取北京时间的当天开始（返回北京时间0点）
function getBeijingStartOfDay() {
  const beijingNow = getBeijingDate();
  const startOfDay = new Date(beijingNow);
  startOfDay.setHours(0, 0, 0, 0);
  return startOfDay;
}

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    console.log('=== 检查崔杰战队成员和金币记录 ===\n');
    
    const todayStart = getBeijingStartOfDay();
    console.log(`- 今日开始时间: ${todayStart.toISOString()}`);
    
    // 查询所有团队
    const teams = await Team.find({});
    console.log(`\n=== 所有团队 ===`);
    
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      console.log(`\n团队 ${i + 1}:`);
      console.log(`- 团队ID: ${team._id}`);
      console.log(`- 团队名称: ${team.name}`);
      console.log(`- 领导ID: ${team.leaderId}`);
      console.log(`- 成员数量: ${team.members ? team.members.length : 0}`);
      
      if (team.members && team.members.length > 0) {
        const memberIds = team.members.map(m => m.userId);
        console.log(`- 成员ID列表: ${memberIds.join(', ')}`);
        
        // 查询这些成员的金币记录
        const todayGoldLogs = await GoldLog.find({
          employeeId: { $in: memberIds },
          createTime: { $gte: todayStart }
        });
        
        console.log(`- 今日金币记录数: ${todayGoldLogs.length}`);
        
        if (todayGoldLogs.length > 0) {
          const todayRevenue = todayGoldLogs.reduce((sum, log) => sum + log.gold, 0);
          console.log(`- 今日总收益（金币）: ${todayRevenue}`);
          console.log(`- 今日总收益（元）: ${(todayRevenue / 1000).toFixed(2)}`);
        }
      }
    }
    
    mongoose.disconnect();
    console.log('\n操作完成');
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    mongoose.disconnect();
  });
