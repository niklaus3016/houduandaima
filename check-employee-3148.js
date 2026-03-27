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

// 检查员工号3148是否存在
async function checkEmployee3148() {
  try {
    console.log('检查员工号3148是否存在...');
    
    // 1. 检查员工列表中是否有3148
    const employeeResponse = await axios.get(`${BASE_URL}/admin/employee/list?search=3148`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`
      }
    });
    
    if (employeeResponse.data.success) {
      const employees = employeeResponse.data.data;
      console.log(`\n1. 员工列表中找到 ${employees.length} 个匹配的员工:`);
      employees.forEach(emp => {
        console.log(`   - 员工号: ${emp.employeeId} - 姓名: ${emp.realName}`);
      });
    }
    
    // 2. 检查新人列表中是否有3148
    try {
      const newUserResponse = await axios.get(`${BASE_URL}/newuser`, {
        headers: {
          'Authorization': `Bearer ${ADMIN_TOKEN}`
        }
      });
      
      if (newUserResponse.data.success) {
        const newUsers = newUserResponse.data.data;
        const user3148 = newUsers.find(user => user.employeeId === '3148');
        console.log(`\n2. 新人列表中是否有3148: ${user3148 ? '是' : '否'}`);
        if (user3148) {
          console.log(`   找到3148: ${user3148.employeeId} - ${user3148.realName}`);
        }
      }
    } catch (error) {
      console.log('\n2. 新人列表接口调用失败:', error.message);
    }
    
    // 3. 检查UserGold表（通过用户收益接口）
    try {
      const userEarningsResponse = await axios.get(`${BASE_URL}/admin/user/3148/earnings`, {
        headers: {
          'Authorization': `Bearer ${ADMIN_TOKEN}`
        }
      });
      
      if (userEarningsResponse.data.success) {
        console.log('\n3. UserGold表中存在3148');
      } else {
        console.log('\n3. UserGold表中不存在3148');
      }
    } catch (error) {
      console.log('\n3. 用户收益接口调用失败:', error.message);
    }
    
    // 4. 检查所有员工，查找是否有包含3148的记录
    const allEmployeesResponse = await axios.get(`${BASE_URL}/admin/employee/list?page=1&pageSize=100`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`
      }
    });
    
    if (allEmployeesResponse.data.success) {
      const allEmployees = allEmployeesResponse.data.data;
      console.log(`\n4. 检查所有 ${allEmployees.length} 个员工的信息:`);
      
      // 查找员工号中包含3的记录
      const employeesWith3 = allEmployees.filter(emp => emp.employeeId.includes('3'));
      console.log(`   员工号中包含3的员工有 ${employeesWith3.length} 个:`);
      employeesWith3.forEach(emp => {
        console.log(`   - ${emp.employeeId} - ${emp.realName}`);
      });
    }
    
  } catch (error) {
    console.log('❌ 检查错误:', error.message);
  }
}

// 运行检查
async function runCheck() {
  console.log('开始检查员工号3148...\n');
  
  // 先登录获取token
  const loginSuccess = await login();
  
  if (loginSuccess) {
    await checkEmployee3148();
  }
}

runCheck();
