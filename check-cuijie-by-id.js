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
    
    // 用团队ID查询"崔杰战队"团队
    console.log('=== 用团队ID查询"崔杰战队"团队 ===\n');
    
    const teamId = '69af8bd4132651c70aa855cd';
    const team = await Team.findById(teamId);
    
    if (!team) {
      console.log('未找到该团队');
    } else {
      console.log('找到团队:');
      console.log(`- 团队ID: ${team._id}`);
      console.log(`- 团队名称: ${team.name}`);
      console.log(`- 领导ID: ${team.leaderId}`);
      console.log(`- 成员数量: ${team.members ? team.members.length : 0}`);
      
      if (team.members && team.members.length > 0) {
        console.log('\n=== 团队成员列表 ===');
        team.members.forEach((member, index) => {
          console.log(`\n成员 ${index + 1}:`);
          console.log(`- userId: ${member.userId}`);
          console.log(`- role: ${member.role}`);
        });
        
        // 计算今日收益
        const memberIds = team.members.map(m => m.userId);
        const todayStart = getBeijingStartOfDay();
        
        console.log('\n=== 计算今日收益 ===');
        console.log(`- 今日开始时间: ${todayStart.toISOString()}`);
        
        const todayGoldLogs = await GoldLog.find({
          userId: { $in: memberIds },
          createTime: { $gte: todayStart }
        });
        
        console.log(`- 今日金币记录数: ${todayGoldLogs.length}`);
        
        if (todayGoldLogs.length > 0) {
          const todayRevenue = todayGoldLogs.reduce((sum, log) => sum + log.gold, 0);
          console.log(`- 今日总收益（金币）: ${todayRevenue}`);
          console.log(`- 今日总收益（元）: ${(todayRevenue / 1000).toFixed(2)}`);
          
          console.log('\n=== 今天的金币记录 ===');
          todayGoldLogs.forEach((log, index) => {
            console.log(`\n记录 ${index + 1}:`);
            console.log(`- 用户ID: ${log.userId}`);
            console.log(`- 员工ID: ${log.employeeId}`);
            console.log(`- ECPM: ${log.ecpm}`);
            console.log(`- 金币: ${log.gold}`);
            console.log(`- 时间: ${log.createTime.toISOString()}`);
          });
        } else {
          console.log('- 今日总收益（金币）: 0');
          console.log('- 今日总收益（元）: 0.00');
        }
      } else {
        console.log('\n团队没有成员');
      }
    }
    
    mongoose.disconnect();
    console.log('\n操作完成');
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    mongoose.disconnect();
  });
