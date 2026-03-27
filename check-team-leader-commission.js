const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const TeamGroup = require('./models/TeamGroup');
const Employee = require('./models/Employee');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkTeamLeaderCommission() {
  try {
    // 连接MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    // 查询cuiding账号的信息
    const admin = await Admin.findOne({ username: 'cuiding' });
    console.log('cuiding账号的信息:', admin);

    if (!admin) {
      console.log('未找到cuiding账号');
      await mongoose.disconnect();
      return;
    }

    // 查询cuiding团队下的所有组（使用teamLeaderId字段）
    const groups = await TeamGroup.find({ teamLeaderId: admin._id });
    console.log('cuiding团队下的所有组:', groups);

    if (groups.length === 0) {
      console.log('cuiding团队下没有组');
      await mongoose.disconnect();
      return;
    }

    // 获取今天的开始时间（UTC）
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    
    // 获取今天的结束时间（UTC）
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    let totalTeamCommission = 0;

    // 遍历每个组，计算组长提成
    for (const group of groups) {
      console.log(`\n计算组 ${group.groupName} 的提成:`);
      
      // 获取组内所有员工
      const employees = await Employee.find({ teamGroupId: group._id });
      const employeeIds = employees.map(employee => employee.employeeId);
      
      // 查询组内员工今天的金币记录
      const goldLogs = await GoldLog.find({
        employeeId: { $in: employeeIds },
        createTime: { $gte: today, $lt: tomorrow }
      });
      
      // 计算总收益和总提成
      let totalEarnings = 0;
      let totalCommission = 0;
      
      goldLogs.forEach(log => {
        const earnings = log.gold / 1000;
        const commissionAmount = earnings * group.commission;
        totalEarnings += earnings;
        totalCommission += commissionAmount;
      });
      
      console.log(`组 ${group.groupName} 的总收益: ${totalEarnings.toFixed(4)} 元`);
      console.log(`组 ${group.groupName} 的总提成: ${totalCommission.toFixed(4)} 元`);
      
      totalTeamCommission += totalCommission;
    }

    console.log(`\ncuiding团队今日的所有组长提成总金额: ${totalTeamCommission.toFixed(4)} 元`);

    // 断开连接
    await mongoose.disconnect();
  } catch (error) {
    console.error('查询错误:', error);
    // 断开连接
    await mongoose.disconnect();
  }
}

checkTeamLeaderCommission();