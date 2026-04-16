const mongoose = require('mongoose');
const UserGold = require('./models/UserGold');

// 连接数据库
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
mongoose.connect(MONGODB_URI);

// 查询多个员工的金币余额
async function checkMultipleEmployeesGold(employeeIds) {
  try {
    console.log(`查询员工 ${employeeIds.join(', ')} 的金币余额情况...`);
    
    // 批量查询员工的 UserGold 记录
    const userGolds = await UserGold.find({ employeeId: { $in: employeeIds } });
    
    if (userGolds.length === 0) {
      console.log('未找到任何员工的金币记录');
    } else {
      console.log(`找到 ${userGolds.length} 条记录:`);
      
      // 按员工号分组
      const employeeMap = {};
      userGolds.forEach(userGold => {
        if (!employeeMap[userGold.employeeId]) {
          employeeMap[userGold.employeeId] = [];
        }
        employeeMap[userGold.employeeId].push(userGold);
      });
      
      // 输出每个员工的记录
      employeeIds.forEach(employeeId => {
        console.log(`\n员工 ${employeeId}:`);
        const records = employeeMap[employeeId] || [];
        
        if (records.length === 0) {
          console.log('  未找到记录');
        } else {
          records.forEach((userGold, index) => {
            console.log(`  记录 ${index + 1}:`);
            console.log(`    用户ID: ${userGold.userId}`);
            console.log(`    本月累计金币: ${userGold.currentMonthGold}`);
            console.log(`    上月累计金币: ${userGold.lastMonthGold}`);
          });
        }
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('查询员工金币余额时出错:', error);
    process.exit(1);
  }
}

// 运行脚本
const employeeIds = ['2222', '5555', '9999', '8886', '8784', '3769'];
checkMultipleEmployeesGold(employeeIds);
