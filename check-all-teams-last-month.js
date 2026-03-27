const mongoose = require('mongoose');
const Team = require('./models/Team');
const GoldLog = require('./models/GoldLog');
const Employee = require('./models/Employee');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 获取北京时间
function getBeijingDate(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

// 获取上月开始时间（UTC）
function getLastMonthStart() {
  const beijingNow = getBeijingDate();
  const startOfLastMonth = new Date(beijingNow);
  startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);
  startOfLastMonth.setDate(1);
  startOfLastMonth.setHours(0, 0, 0, 0);
  // 转换为UTC时间
  return new Date(startOfLastMonth.getTime() - 8 * 60 * 60 * 1000);
}

// 获取上月结束时间（UTC）
function getLastMonthEnd() {
  const beijingNow = getBeijingDate();
  const endOfLastMonth = new Date(beijingNow);
  endOfLastMonth.setDate(0);
  endOfLastMonth.setHours(23, 59, 59, 999);
  // 转换为UTC时间
  return new Date(endOfLastMonth.getTime() - 8 * 60 * 60 * 1000);
}

async function checkAllTeamsLastMonth() {
  try {
    // 连接MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    // 获取上月的时间范围
    const lastMonthStart = getLastMonthStart();
    const lastMonthEnd = getLastMonthEnd();
    console.log('上月时间范围（北京时间）:');
    console.log('开始:', new Date(lastMonthStart.getTime() + 8 * 60 * 60 * 1000).toLocaleString());
    console.log('结束:', new Date(lastMonthEnd.getTime() + 8 * 60 * 60 * 1000).toLocaleString());

    // 查询所有团队
    const teams = await Team.find({});
    console.log('\n团队数量:', teams.length);

    if (teams.length === 0) {
      console.log('没有团队');
      await mongoose.disconnect();
      return;
    }

    // 存储团队收益数据
    const teamEarnings = [];

    for (const team of teams) {
      // 获取团队成员的userId列表
      const memberIds = team.members ? team.members.map(m => m.userId) : [];
      
      // 查询团队成员对应的员工
      const employees = await Employee.find({ userId: { $in: memberIds } });
      const employeeIds = employees.map(e => e.employeeId);

      // 查询上月的金币记录
      const lastMonthGoldLogs = await GoldLog.find({
        employeeId: { $in: employeeIds },
        createTime: { $gte: lastMonthStart, $lte: lastMonthEnd }
      });

      // 计算上月收益
      const lastMonthRevenue = lastMonthGoldLogs.reduce((sum, log) => sum + log.gold, 0) / 1000;

      teamEarnings.push({
        teamId: team._id,
        teamName: team.name,
        leaderId: team.leaderId || '无',
        memberCount: memberIds.length,
        lastMonthRevenue: parseFloat(lastMonthRevenue.toFixed(2))
      });
    }

    // 按收益排序（升序，找出负数）
    teamEarnings.sort((a, b) => a.lastMonthRevenue - b.lastMonthRevenue);

    // 输出结果
    console.log('\n=== 所有团队上月收益 ===');
    teamEarnings.forEach((team, index) => {
      console.log(`${index + 1}. ${team.teamName} - ${team.lastMonthRevenue.toFixed(2)} 元`);
    });

    // 找出收益为负数的团队
    const negativeEarningsTeams = teamEarnings.filter(team => team.lastMonthRevenue < 0);
    if (negativeEarningsTeams.length > 0) {
      console.log('\n=== 收益为负数的团队 ===');
      negativeEarningsTeams.forEach((team, index) => {
        console.log(`${index + 1}. ${team.teamName} - ${team.lastMonthRevenue.toFixed(2)} 元`);
      });
    } else {
      console.log('\n没有收益为负数的团队');
    }

    // 断开连接
    await mongoose.disconnect();
  } catch (error) {
    console.error('查询错误:', error);
    // 断开连接
    await mongoose.disconnect();
  }
}

checkAllTeamsLastMonth();