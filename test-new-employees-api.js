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

// 测试新人列表接口
async function testNewEmployeesApi() {
  try {
    const response = await axios.get(`${BASE_URL}/newuser`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`
      }
    });
    
    if (response.data.success) {
      const newUsers = response.data.data;
      console.log('✅ 新人列表接口调用成功');
      console.log(`\n新人总数: ${newUsers.length}`);
      console.log('\n新人员工号列表:');
      
      newUsers.forEach((user, index) => {
        console.log(`${index + 1}. 员工号: ${user.employeeId} - 姓名: ${user.realName || '未命名'}`);
      });
      
      return newUsers;
    } else {
      console.log('❌ 新人列表接口调用失败:', response.data.message);
      return null;
    }
  } catch (error) {
    console.log('❌ 新人列表接口调用错误:', error.message);
    return null;
  }
}

// 测试员工列表接口 - 获取所有员工
async function testEmployeeListApi() {
  try {
    // 先获取总员工数
    const firstResponse = await axios.get(`${BASE_URL}/admin/employee/list?page=1&pageSize=10`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`
      }
    });
    
    if (!firstResponse.data.success) {
      console.log('❌ 员工列表接口调用失败:', firstResponse.data.message);
      return null;
    }
    
    const total = firstResponse.data.pagination.total;
    console.log('\n✅ 员工列表接口调用成功');
    console.log(`\n总员工数: ${total}`);
    
    // 计算需要多少页
    const pageSize = 50; // 每页50条
    const totalPages = Math.ceil(total / pageSize);
    
    // 获取所有员工
    let allEmployees = [];
    
    for (let page = 1; page <= totalPages; page++) {
      const response = await axios.get(`${BASE_URL}/admin/employee/list?page=${page}&pageSize=${pageSize}`, {
        headers: {
          'Authorization': `Bearer ${ADMIN_TOKEN}`
        }
      });
      
      if (response.data.success) {
        allEmployees = [...allEmployees, ...response.data.data];
      }
    }
    
    console.log('\n所有员工号列表:');
    allEmployees.forEach((emp, index) => {
      console.log(`${index + 1}. 员工号: ${emp.employeeId} - 姓名: ${emp.realName || '未命名'}`);
    });
    
    return allEmployees;
  } catch (error) {
    console.log('❌ 员工列表接口调用错误:', error.message);
    return null;
  }
}

// 运行测试
async function runTest() {
  console.log('开始查询新人信息...\n');
  
  // 先登录获取token
  const loginSuccess = await login();
  
  if (loginSuccess) {
    // 测试新人列表接口
    await testNewEmployeesApi();
    
    // 测试员工列表接口
    await testEmployeeListApi();
  }
}

runTest();
