const mongoose = require('mongoose');
const TeamGroup = require('./models/TeamGroup');
const Employee = require('./models/Employee');
const GoldLog = require('./models/GoldLog');

// 连接数据库
mongoose.connect('mongodb://localhost:27017/your-database-name', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// 计算所有组的提成总金额
async function calculateTotalCommission() {
  try {
    console.log('=== 开始计算所有组的组长提成总金额 ===');
    
    // 获取所有组
    const groups = await TeamGroup.find();
    
    let totalAllGroups = 0;
    
    for (const group of groups) {
      console.log(`\n处理组: ${group.groupName} (ID: ${group._id})`);
      console.log(`提成比例: ${group.commission}`);
      
      // 获取组内所有员工
      const employees = await Employee.find({ teamGroupId: group._id });
      console.log(`组内员工数量: ${employees.length}`);
      
      // 获取今天的开始时间（UTC）
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      
      // 获取今天的结束时间（UTC）
      const tomorrow = new Date(today);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      
      let groupTotal = 0;
      
      // 对每个员工单独计算
      for (const employee of employees) {
        // 查询该员工今天的金币记录，且时间在加入当前组之后
        const goldLogs = await GoldLog.find({
          employeeId: employee.employeeId,
          createTime: { 
            $gte: employee.joinedGroupAt || today, // 如果joinedGroupAt为null，使用今天开始时间
            $lt: tomorrow 
          }
        });
        
        if (goldLogs.length > 0) {
          console.log(`\n员工 ${employee.employeeId} 的金币记录:`);
          goldLogs.forEach(log => {
            const earnings = log.gold / 1000;
            const commissionAmount = earnings * group.commission;
            groupTotal += commissionAmount;
            console.log(`  - ${log.gold}金币 (${log.createTime.toISOString()}) -> 提成: ${commissionAmount.toFixed(4)}元`);
          });
        }
      }
      
      console.log(`\n${group.groupName} 组总提成: ${groupTotal.toFixed(4)}元`);
      totalAllGroups += groupTotal;
    }
    
    console.log(`\n=== 所有组总提成: ${totalAllGroups.toFixed(4)}元 ===`);
    
    mongoose.disconnect();
  } catch (error) {
    console.error('计算提成错误:', error);
    mongoose.disconnect();
  }
}

calculateTotalCommission();