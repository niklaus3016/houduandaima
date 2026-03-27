const mongoose = require('mongoose');
const Employee = require('./models/Employee');

// 连接数据库
mongoose.connect('mongodb://localhost:27017/your-database-name', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// 查询所有员工，按创建时间排序
async function getNewEmployees() {
  try {
    console.log('连接数据库...');
    
    // 查询所有员工，按创建时间倒序排序
    const employees = await Employee.find({})
      .sort({ createdAt: -1 })
      .select('employeeId realName createdAt');
    
    console.log('\n=== 所有新人员工号 ===');
    console.log(`总员工数: ${employees.length}`);
    console.log('\n员工号列表:');
    
    employees.forEach((emp, index) => {
      const createdAt = emp.createdAt ? new Date(emp.createdAt).toLocaleString('zh-CN') : '未知';
      console.log(`${index + 1}. ${emp.employeeId} - ${emp.realName || '未命名'} - 创建时间: ${createdAt}`);
    });
    
    // 按创建时间分组，最近7天的标记为新人
    console.log('\n=== 最近7天的新人 ===');
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentEmployees = employees.filter(emp => 
      emp.createdAt && new Date(emp.createdAt) >= sevenDaysAgo
    );
    
    console.log(`最近7天新入职员工数: ${recentEmployees.length}`);
    console.log('\n新人员工号列表:');
    
    recentEmployees.forEach((emp, index) => {
      const createdAt = new Date(emp.createdAt).toLocaleString('zh-CN');
      console.log(`${index + 1}. ${emp.employeeId} - ${emp.realName || '未命名'} - 创建时间: ${createdAt}`);
    });
    
  } catch (error) {
    console.error('查询员工错误:', error);
  } finally {
    mongoose.disconnect();
  }
}

// 运行查询
getNewEmployees();
