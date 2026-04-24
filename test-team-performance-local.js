const mongoose = require('mongoose');
const Team = require('./models/Team');
const Employee = require('./models/Employee');
const GoldLog = require('./models/GoldLog');

async function testTeamPerformance() {
  try {
    // 连接数据库
    const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    // 模拟接口逻辑
    const range = 'today';
    
    // 获取北京时间
    const beijingNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
    let startDate, endDate, yesterdayStart, yesterdayEnd, lastMonthStart;
    
    if (range === 'month') {
      // 本月
      const monthStart = new Date(beijingNow);
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      startDate = new Date(monthStart.getTime() - 8 * 60 * 60 * 1000);
      endDate = new Date();
      
      // 上月
      const lastMonth = new Date(beijingNow);
      lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
      lastMonth.setUTCDate(1);
      lastMonth.setUTCHours(0, 0, 0, 0);
      lastMonthStart = new Date(lastMonth.getTime() - 8 * 60 * 60 * 1000);
    } else {
      // 今日
      const todayStartBeijing = new Date(beijingNow);
      todayStartBeijing.setUTCHours(0, 0, 0, 0);
      startDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
      endDate = new Date();
      
      // 昨日
      const yesterdayStartBeijing = new Date(beijingNow);
      yesterdayStartBeijing.setUTCDate(yesterdayStartBeijing.getUTCDate() - 1);
      yesterdayStartBeijing.setUTCHours(0, 0, 0, 0);
      yesterdayStart = new Date(yesterdayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
      
      const yesterdayEndBeijing = new Date(beijingNow);
      yesterdayEndBeijing.setUTCHours(0, 0, 0, 0);
      yesterdayEnd = new Date(yesterdayEndBeijing.getTime() - 8 * 60 * 60 * 1000);
    }
    
    console.log('时间范围:');
    console.log('开始时间:', startDate.toISOString());
    console.log('结束时间:', endDate.toISOString());
    
    // 获取所有团队
    console.log('\n=== 获取团队列表 ===');
    const teams = await Team.find();
    console.log(`找到 ${teams.length} 个团队`);
    
    if (teams.length === 0) {
      console.log('没有团队数据，创建一个测试团队');
      // 创建测试团队
      const testTeam = new Team({
        name: '测试团队',
        leaderId: '8202',
        members: [
          { userId: '1111' },
          { userId: '2222' },
          { userId: '3333' }
        ]
      });
      await testTeam.save();
      console.log('测试团队创建成功');
      return;
    }
    
    console.log('\n=== 团队详细信息 ===');
    teams.forEach(team => {
      console.log(`团队: ${team.name}, 团队长: ${team.leaderId}, 成员数: ${team.members.length}`);
    });
    
    // 测试第一个团队
    const testTeam = teams[0];
    console.log('\n=== 测试团队:', testTeam.name, '===');
    
    // 获取团队成员的userId列表
    const memberUserIds = testTeam.members.map(m => m.userId);
    console.log('团队成员userId:', memberUserIds);
    
    // 获取团队成员的employeeId列表
    console.log('\n=== 获取员工信息 ===');
    const employees = await Employee.find({ userId: { $in: memberUserIds } });
    console.log(`找到 ${employees.length} 个员工`);
    employees.forEach(emp => {
      console.log(`员工: ${emp.employeeId}, 用户ID: ${emp.userId}`);
    });
    
    const memberEmployeeIds = employees.map(e => e.employeeId);
    console.log('员工ID列表:', memberEmployeeIds);
    
    // 统计当前时间范围的金币记录
    console.log('\n=== 统计金币记录 ===');
    const currentStats = await GoldLog.aggregate([
      {
        $match: {
          employeeId: { $in: memberEmployeeIds },
          createTime: { $gte: startDate, $lt: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalGold: { $sum: '$gold' },
          totalAds: { $sum: 1 }
        }
      }
    ]);
    
    console.log('金币统计结果:', currentStats);
    
    const totalGold = currentStats[0]?.totalGold || 0;
    const totalAds = currentStats[0]?.totalAds || 0;
    const avgGold = totalAds > 0 ? totalGold / totalAds : 0;
    
    console.log('总金币:', totalGold);
    console.log('总广告数:', totalAds);
    console.log('平均金币:', avgGold);
    
    // 计算增长率
    let growthRate = 0;
    if (range === 'today' && yesterdayStart) {
      console.log('\n=== 计算昨日数据 ===');
      const yesterdayStats = await GoldLog.aggregate([
        {
          $match: {
            employeeId: { $in: memberEmployeeIds },
            createTime: { $gte: yesterdayStart, $lt: yesterdayEnd }
          }
        },
        {
          $group: {
            _id: null,
            totalGold: { $sum: '$gold' }
          }
        }
      ]);
      
      console.log('昨日金币统计:', yesterdayStats);
      const yesterdayGold = yesterdayStats[0]?.totalGold || 0;
      console.log('昨日总金币:', yesterdayGold);
      
      if (yesterdayGold > 0) {
        growthRate = ((totalGold - yesterdayGold) / yesterdayGold) * 100;
        console.log('增长率:', growthRate);
      }
    }
    
    // 构建返回数据
    const teamData = {
      teamName: testTeam.name,
      leaderId: testTeam.leaderId,
      memberCount: testTeam.members.length,
      totalAds: totalAds,
      totalRevenue: totalGold / 1000, // 转换为元
      avgGold: parseFloat(avgGold.toFixed(2)),
      growthRate: parseFloat(growthRate.toFixed(2))
    };
    
    console.log('\n=== 最终数据 ===');
    console.log(JSON.stringify(teamData, null, 2));
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('测试失败:', error);
    await mongoose.disconnect();
  }
}

testTeamPerformance();