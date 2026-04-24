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

async function checkFanjieData() {
  try {
    // 连接MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功\n');

    // 查找用户fanjie
    const fanjie = await Admin.findOne({ username: 'fanjie' });
    if (!fanjie) {
      console.log('未找到用户fanjie');
      await mongoose.disconnect();
      return;
    }

    console.log('========== 用户fanjie信息 ==========');
    console.log('用户名:', fanjie.username);
    console.log('真实姓名:', fanjie.realName);
    console.log('角色:', fanjie.role);
    console.log('teamGroupId:', fanjie.teamGroupId);
    console.log('teamName:', fanjie.teamName);
    console.log('');

    if (!fanjie.teamGroupId) {
      console.log('fanjie不是组长（没有teamGroupId）');
      await mongoose.disconnect();
      return;
    }

    // 获取组信息
    const group = await TeamGroup.findById(fanjie.teamGroupId);
    if (!group) {
      console.log('未找到对应组信息');
      await mongoose.disconnect();
      return;
    }

    console.log('========== 组信息 ==========');
    console.log('组ID:', group._id.toString());
    console.log('组名:', group.groupName);
    console.log('团队名:', group.teamName);
    console.log('组长姓名:', group.groupLeaderName);
    console.log('提成比例:', group.commission);
    console.log('成员数:', group.memberCount);
    console.log('');

    // 获取该组的所有员工
    const employees = await Employee.find({ teamGroupId: group._id.toString() });
    console.log(`========== 组成员（${employees.length}人）==========`);
    employees.forEach(emp => {
      console.log(`- ${emp.employeeId}: ${emp.realName} (入组时间: ${emp.joinedGroupAt?.toISOString() || '未知'})`);
    });
    console.log('');

    const employeeIds = employees.map(e => e.employeeId);

    // 测试不同的时间范围
    const ranges = ['today', 'yesterday', 'week', 'month'];
    
    for (const range of ranges) {
      console.log(`\n========== ${range} 统计数据 ==========`);
      
      const { startTime, endTime } = getTimeRange(range);
      console.log(`时间范围: ${startTime.toISOString()} 到 ${endTime.toISOString()}`);

      // 获取指定时间范围内的金币记录
      const goldLogs = await GoldLog.find({
        employeeId: { $in: employeeIds },
        createTime: { $gte: startTime, $lt: endTime }
      });

      console.log(`金币记录数: ${goldLogs.length}`);

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
      const avgGoldByAll = employees.length > 0 ? totalGold / employees.length : 0;

      console.log('\n统计结果:');
      console.log('活跃成员数:', activeMemberCount);
      console.log('总金币:', totalGold);
      console.log('总收益:', totalEarnings.toFixed(4), '元');
      console.log('总提成:', totalCommission.toFixed(4), '元');
      console.log('平均金币(按活跃):', avgGoldByActive.toFixed(2));
      console.log('平均金币(按全部):', avgGoldByAll.toFixed(2));
    }

    // 断开连接
    await mongoose.disconnect();
    console.log('\n查询完成');
  } catch (error) {
    console.error('查询错误:', error);
    await mongoose.disconnect();
  }
}

checkFanjieData();
