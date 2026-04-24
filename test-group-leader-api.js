const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const TeamGroup = require('./models/TeamGroup');
const Employee = require('./models/Employee');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 获取北京时间（UTC+8）
function getBeijingDate(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

// 获取时间范围
function getTimeRange(range) {
  const now = new Date();
  const beijingNow = getBeijingDate(now);
  let startTime, endTime;

  if (range === 'today') {
    // 今天（北京时间）
    startTime = new Date(beijingNow);
    startTime.setUTCHours(0, 0, 0, 0);
    startTime = new Date(startTime.getTime() - 8 * 60 * 60 * 1000);
    endTime = new Date(startTime);
    endTime.setUTCDate(endTime.getUTCDate() + 1);
  } else if (range === 'yesterday') {
    // 昨天（北京时间）
    startTime = new Date(beijingNow);
    startTime.setUTCDate(startTime.getUTCDate() - 1);
    startTime.setUTCHours(0, 0, 0, 0);
    startTime = new Date(startTime.getTime() - 8 * 60 * 60 * 1000);
    endTime = new Date(startTime);
    endTime.setUTCDate(endTime.getUTCDate() + 1);
  } else if (range === 'week') {
    // 本周一（北京时间）
    const dayOfWeek = beijingNow.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startTime = new Date(beijingNow);
    startTime.setUTCDate(startTime.getUTCDate() + mondayOffset);
    startTime.setUTCHours(0, 0, 0, 0);
    startTime = new Date(startTime.getTime() - 8 * 60 * 60 * 1000);
    endTime = now;
  } else if (range === 'month') {
    // 本月1日（北京时间）
    startTime = new Date(beijingNow);
    startTime.setUTCDate(1);
    startTime.setUTCHours(0, 0, 0, 0);
    startTime = new Date(startTime.getTime() - 8 * 60 * 60 * 1000);
    endTime = now;
  } else {
    // 默认今天
    startTime = new Date(beijingNow);
    startTime.setUTCHours(0, 0, 0, 0);
    startTime = new Date(startTime.getTime() - 8 * 60 * 60 * 1000);
    endTime = new Date(startTime);
    endTime.setUTCDate(endTime.getUTCDate() + 1);
  }

  return { startTime, endTime };
}

async function testGroupLeaderStats() {
  try {
    // 连接MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功\n');

    // 查找所有组长
    const groupLeaders = await Admin.find({ teamGroupId: { $ne: null } });
    console.log(`找到 ${groupLeaders.length} 个组长`);

    if (groupLeaders.length === 0) {
      console.log('没有找到组长，退出测试');
      await mongoose.disconnect();
      return;
    }

    // 测试第一个组长
    const testLeader = groupLeaders[0];
    console.log(`测试组长: ${testLeader.username} (${testLeader.realName})`);
    console.log(`组ID: ${testLeader.teamGroupId}\n`);

    // 获取组信息
    const group = await TeamGroup.findById(testLeader.teamGroupId);
    if (!group) {
      console.log('组不存在');
      await mongoose.disconnect();
      return;
    }

    console.log(`组名: ${group.groupName}`);
    console.log(`提成比例: ${group.commission}\n`);

    // 测试不同的时间范围
    const ranges = ['today', 'yesterday', 'week', 'month'];
    
    for (const range of ranges) {
      console.log(`\n========== 测试 ${range} ==========`);
      
      const { startTime, endTime } = getTimeRange(range);
      console.log(`时间范围: ${startTime} 到 ${endTime}`);

      // 获取该组的所有员工
      const employees = await Employee.find({ teamGroupId: group._id.toString() });
      const employeeIds = employees.map(e => e.employeeId);
      const memberCount = employees.length;
      console.log(`组成员数: ${memberCount}`);

      // 获取指定时间范围内的金币记录
      const goldLogs = await GoldLog.find({
        employeeId: { $in: employeeIds },
        createTime: { $gte: startTime, $lt: endTime }
      });

      // 创建员工ID到员工信息的映射
      const employeeMap = new Map();
      employees.forEach(employee => {
        employeeMap.set(employee.employeeId, employee);
      });

      // 计算总收益、总提成和总金币
      let totalEarnings = 0;
      let totalCommission = 0;
      let totalGold = 0;
      const activeMembers = new Set();

      for (const log of goldLogs) {
        const employee = employeeMap.get(log.employeeId);
        if (employee) {
          const joinedGroupAt = employee.joinedGroupAt || log.createTime;
          if (log.createTime >= joinedGroupAt) {
            const earnings = log.gold / 1000;
            const commissionRate = log.commissionRate || group.commission;
            const commissionAmount = earnings * commissionRate;
            
            totalEarnings += earnings;
            totalCommission += commissionAmount;
            totalGold += log.gold;
            activeMembers.add(log.employeeId);
          }
        }
      }

      const activeMemberCount = activeMembers.size;
      const avgGoldByActive = activeMemberCount > 0 ? totalGold / activeMemberCount : 0;
      const avgGoldByAll = memberCount > 0 ? totalGold / memberCount : 0;

      console.log(`活跃成员数: ${activeMemberCount}`);
      console.log(`总金币: ${totalGold}`);
      console.log(`总收益: ${totalEarnings.toFixed(4)} 元`);
      console.log(`总提成: ${totalCommission.toFixed(4)} 元`);
      console.log(`平均金币(按活跃): ${avgGoldByActive.toFixed(2)}`);
      console.log(`平均金币(按全部): ${avgGoldByAll.toFixed(2)}`);
    }

    // 断开连接
    await mongoose.disconnect();
    console.log('\n测试完成');
  } catch (error) {
    console.error('测试错误:', error);
    await mongoose.disconnect();
  }
}

testGroupLeaderStats();
