const axios = require('axios');

// 生产环境API地址
const BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

// 测试用的管理员token
let ADMIN_TOKEN = '';

// 登录获取token
async function login() {
  try {
    const response = await axios.post(`${BASE_URL}/admin/login`, {
      username: 'admin',
      password: 'admin123'
    });
    
    if (response.data.success && response.data.data?.token) {
      ADMIN_TOKEN = response.data.data.token;
      console.log('✅ 登录成功，获取到token');
      return true;
    } else {
      console.log('❌ 登录失败');
      return false;
    }
  } catch (error) {
    console.log('❌ 登录错误:', error.message);
    return false;
  }
}

// 检查是否有重复的员工号
async function checkDuplicateEmployees() {
  try {
    // 获取所有员工
    const pageSize = 100; // 每页100条，确保能获取所有员工
    const response = await axios.get(`${BASE_URL}/admin/employee/list?page=1&pageSize=${pageSize}`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`
      }
    });
    
    if (response.data.success) {
      const employees = response.data.data;
      const total = response.data.pagination.total;
      
      console.log(`✅ 获取到 ${employees.length} 个员工 (总员工数: ${total})`);
      
      // 检查重复的员工号
      const employeeIdMap = {};
      const duplicates = [];
      
      employees.forEach(emp => {
        if (employeeIdMap[emp.employeeId]) {
          duplicates.push(emp.employeeId);
        } else {
          employeeIdMap[emp.employeeId] = true;
        }
      });
      
      if (duplicates.length > 0) {
        console.log('\n❌ 发现重复的员工号:');
        duplicates.forEach(empId => {
          console.log(`- ${empId}`);
        });
      } else {
        console.log('\n✅ 没有发现重复的员工号');
      }
      
      // 检查员工号格式
      console.log('\n检查员工号格式:');
      employees.forEach(emp => {
        if (!/^\d+$/.test(emp.employeeId)) {
          console.log(`❌ 员工号格式异常: ${emp.employeeId} (姓名: ${emp.realName})`);
        }
      });
      
      // 按员工号排序显示
      console.log('\n按员工号排序的员工列表:');
      employees.sort((a, b) => parseInt(a.employeeId) - parseInt(b.employeeId));
      employees.forEach((emp, index) => {
        console.log(`${index + 1}. 员工号: ${emp.employeeId} - 姓名: ${emp.realName || '未命名'} - ID: ${emp._id}`);
      });
      
      return employees;
    } else {
      console.log('❌ 获取员工列表失败:', response.data.message);
      return null;
    }
  } catch (error) {
    console.log('❌ 检查员工错误:', error.message);
    return null;
  }
}

// 运行检查
async function runCheck() {
  console.log('开始检查员工记录...\n');
  
  // 先登录获取token
  const loginSuccess = await login();
  
  if (loginSuccess) {
    await checkDuplicateEmployees();
  }
}

runCheck();
