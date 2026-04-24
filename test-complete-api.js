const mongoose = require('mongoose');

// MongoDB连接字符串
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 导入模型
const TeamGroup = require('./models/TeamGroup');
const Employee = require('./models/Employee');
const GoldLog = require('./models/GoldLog');

async function testCompleteApi() {
  try {
    console.log('=== 测试完整API逻辑 ===\n');

    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功\n');

    const fanjieUserId = '69cd2b814b7bff2403ab4f70';
    const range = 'today';
    console.log(`测试用户ID: ${fanjieUserId}`);
    console.log(`时间范围: ${range}\n`);

    // 1. 获取北京时间
    console.log('1. 获取时间范围:');
    const beijingNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
    let startDate, endDate, yesterdayStart, yesterdayEnd, lastMonthStart;

    if (range === 'month') {
      const monthStart = new Date(beijingNow);
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      startDate = new Date(monthStart.getTime() - 8 * 60 * 60 * 1000);
      endDate = new Date();

      const lastMonth = new Date(beijingNow);
      lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
      lastMonth.setUTCDate(1);
      lastMonth.setUTCHours(0, 0, 0, 0);
      lastMonthStart = new Date(lastMonth.getTime() - 8 * 60 * 60 * 1000);
    } else {
      const todayStartBeijing = new Date(beijingNow);
      todayStartBeijing.setUTCHours(0, 0, 0, 0);
      startDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
      endDate = new Date();

      const yesterdayStartBeijing = new Date(beijingNow);
      yesterdayStartBeijing.setUTCDate(yesterdayStartBeijing.getUTCDate() - 1);
      yesterdayStartBeijing.setUTCHours(0, 0, 0, 0);
      yesterdayStart = new Date(yesterdayStartBeijing.getTime() - 8 * 60 * 60 * 1000);

      const yesterdayEndBeijing = new Date(beijingNow);
      yesterdayEndBeijing.setUTCHours(0, 0, 0, 0);
      yesterdayEnd = new Date(yesterdayEndBeijing.getTime() - 8 * 60 * 60 * 1000);
    }

    console.log(`  开始时间: ${startDate}`);
    console.log(`  结束时间: ${endDate}`);
    console.log('');

    // 2. 查TeamGroup
    console.log('2. 查询TeamGroup:');
    const groups = await TeamGroup.find({
      $or: [
        { teamLeaderId: fanjieUserId },
        { teamLeaderId: new mongoose.Types.ObjectId(fanjieUserId) }
      ]
    });
    console.log(`找到 ${groups.length} 个组`);
    groups.forEach(g => {
      console.log(`  - ${g.groupName} (id: ${g._id}, teamLeaderId: ${g.teamLeaderId})`);
    });
    console.log('');

    if (groups.length > 0) {
      // 3. 收集ID
      const groupIds = groups.map(g => g._id.toString());
      const teamLeaderIds = groups.map(g => g.teamLeaderId?.toString()).filter(id => id);
      console.log('3. 收集的ID:');
      console.log(`  groupIds: ${groupIds}`);
      console.log(`  teamLeaderIds: ${teamLeaderIds}`);
      console.log('');

      // 4. 查Employee
      console.log('4. 查询Employee:');
      const allEmployees = await Employee.find({
        $or: [
          { teamGroupId: { $in: groupIds } },
          { teamGroupId: { $in: teamLeaderIds } }
        ]
      });
      console.log(`找到 ${allEmployees.length} 个员工`);
      console.log('');

      // 5. 按groupName分组
      console.log('5. 按groupName分组:');
      const employeesByGroup = {};
      allEmployees.forEach(emp => {
        if (emp.groupName) {
          if (!employeesByGroup[emp.groupName]) {
            employeesByGroup[emp.groupName] = [];
          }
          employeesByGroup[emp.groupName].push(emp);
        }
      });

      console.log(`共有 ${Object.keys(employeesByGroup).length} 个组:`);
      Object.entries(employeesByGroup).forEach(([groupName, emps]) => {
        console.log(`  - ${groupName}: ${emps.length} 个员工`);
      });
      console.log('');

      // 6. 收集所有员工ID
      const allEmployeeIds = allEmployees.map(e => e.employeeId);
      console.log('6. 收集员工ID:');
      console.log(`  员工ID数量: ${allEmployeeIds.length}`);
      console.log('');

      // 7. 查询金币记录
      console.log('7. 查询金币记录:');
      const currentStats = await GoldLog.aggregate([
        {
          $match: {
            employeeId: { $in: allEmployeeIds },
            createTime: { $gte: startDate, $lt: endDate }
          }
        },
        {
          $group: {
            _id: '$employeeId',
            totalGold: { $sum: '$gold' },
            totalAds: { $sum: 1 }
          }
        }
      ]);
      console.log(`  金币记录: ${currentStats.length} 条`);
      console.log('');

      // 8. 构建统计数据
      console.log('8. 构建统计数据:');
      const statsByEmployee = {};
      currentStats.forEach(stat => {
        statsByEmployee[stat._id] = { totalGold: stat.totalGold, totalAds: stat.totalAds };
      });

      // 9. 构建组数据
      console.log('9. 构建组数据:');
      const groupData = groups.map(group => {
        const employees = employeesByGroup[group.groupName] || [];
        const memberEmployeeIds = employees.map(e => e.employeeId);

        let totalGold = 0;
        let totalAds = 0;

        memberEmployeeIds.forEach(empId => {
          const stat = statsByEmployee[empId];
          if (stat) {
            totalGold += stat.totalGold;
            totalAds += stat.totalAds;
          }
        });

        const avgGold = totalAds > 0 ? totalGold / totalAds : 0;

        return {
          groupId: group._id.toString(),
          groupName: group.groupName,
          groupLeaderName: group.groupLeaderName || '',
          memberCount: employees.length,
          totalAds: totalAds,
          totalRevenue: totalGold / 1000,
          avgGold: parseFloat(avgGold.toFixed(2)),
          commission: group.commission || 0.05,
          createdAt: group.createdAt
        };
      });

      console.log(`  构建了 ${groupData.length} 个组的数据`);
      groupData.forEach(group => {
        console.log(`  - ${group.groupName}: ${group.memberCount}人, ${group.totalRevenue.toFixed(2)}元`);
      });
      console.log('');

      // 10. 计算总计数据
      console.log('10. 计算总计数据:');
      const totalGroups = groupData.length;
      const totalMembers = groupData.reduce((sum, group) => sum + group.memberCount, 0);
      const totalRevenue = groupData.reduce((sum, group) => sum + group.totalRevenue, 0);

      console.log(`  总计: ${totalGroups}个组, ${totalMembers}个成员, ${totalRevenue.toFixed(2)}元`);
      console.log('');

      // 11. 最终结果
      console.log('11. 最终结果:');
      const finalResult = {
        success: true,
        message: '获取团队组列表成功',
        data: groupData,
        totalGroups: totalGroups,
        totalMembers: totalMembers,
        totalRevenue: parseFloat(totalRevenue.toFixed(2))
      };

      console.log(JSON.stringify(finalResult, null, 2));
    }

    await mongoose.connection.close();

  } catch (error) {
    console.error('测试失败:', error.message);
    if (error.stack) {
      console.error('错误堆栈:', error.stack);
    }
  }
}

testCompleteApi();
