const mongoose = require('mongoose');
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
    
    // 从teamgroups集合获取团队数据
    const db = mongoose.connection;
    const teamGroups = await db.collection('teamgroups').find({}).toArray();
    
    console.log('\n=== 获取团队组数据 ===');
    console.log(`找到 ${teamGroups.length} 个团队组`);
    
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
    console.log('\n=== 获取管理员数据 ===');
    console.log(`找到 ${admins.length} 个管理员`);
    
    admins.forEach(admin => {
      console.log(`管理员: ${admin.username} - ${admin.realName} - ${admin.teamName || '无团队'}`);
    });
    
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
    
    // 转换为数组
    const teams = Object.values(teamsByGroup);
    console.log('\n=== 最终团队列表 ===');
    console.log(`找到 ${teams.length} 个团队`);
    
    teams.forEach(team => {
      console.log(`团队: ${team.teamName}, 团队长: ${team.leaderId}, 分组数: ${team.groups.length}`);
    });
    
    // 测试所有团队
    console.log('\n=== 测试所有团队 ===');
    const teamDataList = [];
    
    for (const team of teams) {
      console.log(`\n--- 测试团队: ${team.teamName} ---`);
      
      // 获取团队所有分组的ID
      const groupIds = team.groups.map(g => g._id.toString());
      console.log('团队分组ID:', groupIds);
      
      // 通过团队组ID或父ID获取相关员工
      const employees = await Employee.find({ 
        $or: [
          { teamGroupId: { $in: groupIds } },
          { parentId: team.leaderId }
        ]
      });
      console.log(`找到 ${employees.length} 个员工`);
      
      employees.forEach(emp => {
        console.log(`员工: ${emp.employeeId}, 团队组ID: ${emp.teamGroupId}, 父ID: ${emp.parentId}`);
      });
      
      const memberEmployeeIds = employees.map(e => e.employeeId);
      console.log('员工ID列表:', memberEmployeeIds);
      
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
        console.log('昨日总金币:', yesterdayGold);
        
        if (yesterdayGold > 0) {
          growthRate = ((totalGold - yesterdayGold) / yesterdayGold) * 100;
          console.log('增长率:', growthRate);
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
      console.log('团队数据:', JSON.stringify(teamData, null, 2));
    }
    
    // 按总收益排序
    teamDataList.sort((a, b) => b.totalRevenue - a.totalRevenue);
    
    console.log('\n=== 最终排序结果 ===');
    console.log(JSON.stringify(teamDataList, null, 2));
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('测试失败:', error);
    await mongoose.disconnect();
  }
}

testTeamPerformance();