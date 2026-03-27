const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const TeamGroup = require('./models/TeamGroup');
const Employee = require('./models/Employee');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkAllGroupsCommission() {
  try {
    // 连接MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    // 获取当前UTC时间
    const now = new Date();
    
    // 转换为北京时间（UTC+8）
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    
    // 获取北京时间的今天开始时间（UTC）
    const today = new Date(beijingTime);
    today.setUTCHours(0, 0, 0, 0);
    today.setTime(today.getTime() - 8 * 60 * 60 * 1000); // 转回UTC
    
    // 获取北京时间的明天开始时间（UTC）
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    console.log('查询时间范围:', today, 'to', tomorrow);

    // 查询所有组
    const allGroups = await TeamGroup.find();
    console.log('所有组数量:', allGroups.length);

    if (allGroups.length === 0) {
      console.log('没有组');
      await mongoose.disconnect();
      return;
    }

    // 查询所有今天的金币记录
    const allGoldLogs = await GoldLog.find({
      createTime: { $gte: today, $lt: tomorrow }
    });
    console.log('今天的金币记录数量:', allGoldLogs.length);

    // 提取所有唯一的员工ID
    const employeeIds = [...new Set(allGoldLogs.map(log => log.employeeId))];
    console.log('涉及的员工数量:', employeeIds.length);

    // 批量查询员工信息
    const employees = await Employee.find({ employeeId: { $in: employeeIds } });
    console.log('找到的员工数量:', employees.length);

    // 创建员工ID到员工信息的映射
    const employeeMap = new Map();
    employees.forEach(employee => {
      employeeMap.set(employee.employeeId, employee);
    });

    // 为每个组计算提成
    for (const group of allGroups) {
      console.log(`\n计算组 ${group.groupName} (${group._id}) 的提成:`);
      
      let groupEarnings = 0;
      let groupCommission = 0;
      let groupRecords = [];
      
      // 对每个金币记录，检查其产生时员工是否在当前组
      for (const log of allGoldLogs) {
        // 从映射中获取员工信息
        const employee = employeeMap.get(log.employeeId);
        if (employee) {
          // 检查金币产生时间是否在员工加入当前组之后
          const joinedGroupAt = employee.joinedGroupAt || today;
          
          // 检查金币产生时间是否在入组时间之后
          if (log.createTime >= joinedGroupAt) {
            // 检查员工当前是否在当前组
            if (employee.teamGroupId === group._id.toString()) {
              const earnings = log.gold / 1000;
              // 使用金币记录中保存的提成比例来计算提成
              // 如果金币记录中没有提成比例，则使用当前组的提成比例
              const commissionRate = log.commissionRate || group.commission;
              const commissionAmount = earnings * commissionRate;
              groupEarnings += earnings;
              groupCommission += commissionAmount;
              
              groupRecords.push({
                employeeId: log.employeeId,
                gold: log.gold,
                earnings: earnings,
                commission: commissionRate,
                commissionAmount: commissionAmount
              });
            }
          }
        }
      }
      
      console.log(`组 ${group.groupName} 的总收益: ${groupEarnings.toFixed(4)} 元`);
      console.log(`组 ${group.groupName} 的总提成: ${groupCommission.toFixed(4)} 元`);
      console.log(`组 ${group.groupName} 的记录数量: ${groupRecords.length}`);
      
      if (groupRecords.length > 0) {
        console.log('前5条记录:', groupRecords.slice(0, 5));
      }
    }

    // 断开连接
    await mongoose.disconnect();
  } catch (error) {
    console.error('查询错误:', error);
    // 断开连接
    await mongoose.disconnect();
  }
}

checkAllGroupsCommission();