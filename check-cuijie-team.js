const mongoose = require('mongoose');
const Team = require('./models/Team');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

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
    
    // 查找"崔杰"团队
    console.log('=== 查找"崔杰"团队 ===\n');
    
    const team = await Team.findOne({ name: '崔杰' });
    
    if (!team) {
      console.log('未找到"崔杰"团队');
      
      // 显示所有团队名称
      const allTeams = await Team.find({});
      console.log('\n=== 所有团队列表 ===');
      allTeams.forEach(t => {
        console.log(`- ${t.name}`);
      });
    } else {
      console.log('找到"崔杰"团队:');
      console.log(`- 团队ID: ${team._id}`);
      console.log(`- 团队名称: ${team.name}`);
      console.log(`- 领导ID: ${team.leaderId}`);
      console.log(`- 成员数量: ${team.members ? team.members.length : 0}`);
      
      // 计算今日收益
      const memberIds = team.members ? team.members.map(m => m.userId) : [];
      const todayStart = getBeijingStartOfDay();
      
      console.log('\n=== 计算今日收益 ===');
      console.log(`- 今日开始时间: ${todayStart.toISOString()}`);
      console.log(`- 成员ID列表: ${memberIds.length > 0 ? memberIds.slice(0, 3).join(', ') + (memberIds.length > 3 ? '...' : '') : '无'}`);
      
      const todayGoldLogs = await GoldLog.find({
        userId: { $in: memberIds },
        createTime: { $gte: todayStart }
      });
      
      console.log(`- 今日金币记录数: ${todayGoldLogs.length}`);
      
      const todayRevenue = todayGoldLogs.reduce((sum, log) => sum + log.gold, 0);
      
      console.log('\n=== 今日收益详情 ===');
      console.log(`- 今日总收益（金币）: ${todayRevenue}`);
      console.log(`- 今日总收益（元）: ${(todayRevenue / 1000).toFixed(2)}`);
      console.log(`- 今日广告数量: ${todayGoldLogs.length}`);
      
      if (todayGoldLogs.length > 0) {
        console.log('\n=== 最近的金币记录 ===');
        todayGoldLogs.slice(0, 5).forEach((log, index) => {
          console.log(`\n记录 ${index + 1}:`);
          console.log(`- 用户ID: ${log.userId}`);
          console.log(`- 员工ID: ${log.employeeId}`);
          console.log(`- ECPM: ${log.ecpm}`);
          console.log(`- 金币: ${log.gold}`);
          console.log(`- 时间: ${log.createTime.toISOString()}`);
        });
      }
    }
    
    mongoose.disconnect();
    console.log('\n操作完成');
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    mongoose.disconnect();
  });
