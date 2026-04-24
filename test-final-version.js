const mongoose = require('mongoose');
const Employee = require('./models/Employee');
const GoldLog = require('./models/GoldLog');

async function testFinalVersion() {
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
    
    // 从teamgroups集合获取团队数据
    const db = mongoose.connection;
    const teamGroups = await db.collection('teamgroups').find({}).toArray();
    
    // 按团队名称分组
    const teamsByGroup = {};
    teamGroups.forEach(group => {
      if (!teamsByGroup[group.teamName]) {
        teamsByGroup[group.teamName] = {
          teamName: group.teamName,
          leaderId: group.teamLeaderId,
          groups: []
        };
      }
      teamsByGroup[group.teamName].groups.push(group);
    });
    
    // 获取所有管理员，包括团队长
    const admins = await db.collection('admins').find({}).toArray();
    
    // 为每个管理员添加到团队列表（如果有teamName）
    admins.forEach(admin => {
      if (admin.teamName) {
        if (!teamsByGroup[admin.teamName]) {
          teamsByGroup[admin.teamName] = {
            teamName: admin.teamName,
            leaderId: admin._id.toString(),
            groups: []
          };
        }
      }
    });
    
    // 转换为数组并过滤掉测试团队
    let teams = Object.values(teamsByGroup);
    teams = teams.filter(team => {
      const excludedTeams = ['华东团队', '测试团队'];
      return !excludedTeams.includes(team.teamName);
    });
    
    // 测试所有团队
    const teamDataList = [];
    
    for (const team of teams) {
      // 获取团队所有分组的ID
      const groupIds = team.groups.map(g => g._id.toString());
      
      // 通过团队组ID或父ID获取相关员工
      const employees = await Employee.find({ 
        $or: [
          { teamGroupId: { $in: groupIds } },
          { parentId: team.leaderId }
        ]
      });
      const memberEmployeeIds = employees.map(e => e.employeeId);
      
      // 统计当前时间范围的金币记录
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
      
      const totalGold = currentStats[0]?.totalGold || 0;
      const totalAds = currentStats[0]?.totalAds || 0;
      const avgGold = totalAds > 0 ? totalGold / totalAds : 0;
      
      // 计算增长率
      let growthRate = 0;
      if (range === 'today' && yesterdayStart) {
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
        
        const yesterdayGold = yesterdayStats[0]?.totalGold || 0;
        if (yesterdayGold > 0) {
          growthRate = ((totalGold - yesterdayGold) / yesterdayGold) * 100;
        }
      }
      
      // 构建返回数据
      const teamData = {
        teamName: team.teamName,
        leaderId: team.leaderId,
        memberCount: employees.length,
        totalAds: totalAds,
        totalRevenue: totalGold / 1000, // 转换为元
        avgGold: parseFloat(avgGold.toFixed(2)),
        growthRate: parseFloat(growthRate.toFixed(2))
      };
      
      teamDataList.push(teamData);
    }
    
    // 按总收益排序
    teamDataList.sort((a, b) => b.totalRevenue - a.totalRevenue);
    
    // 计算总计数据
    const totalTeams = teamDataList.length;
    const totalMembers = teamDataList.reduce((sum, team) => sum + team.memberCount, 0);
    
    console.log('=== 最终团队业绩数据 ===');
    console.log(JSON.stringify({
      success: true,
      data: teamDataList,
      totalTeams: totalTeams,
      totalMembers: totalMembers
    }, null, 2));
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('测试失败:', error);
    await mongoose.disconnect();
  }
}

testFinalVersion();