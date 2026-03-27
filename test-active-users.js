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

// 测试KPI接口获取活跃用户数
async function testActiveUsers() {
  try {
    const response = await axios.get(`${BASE_URL}/admin/dashboard/kpi`, {
      headers: {
        'Authorization': `Bearer ${ADMIN_TOKEN}`
      }
    });
    
    if (response.data.success) {
      const data = response.data.data;
      console.log('✅ KPI接口调用成功');
      console.log('今日总活跃用户数:', data.activeUsers);
      console.log('活跃用户增长率:', data.activeUsersGrowth, '%');
      
      // 计算昨日活跃用户数
      const yesterdayActiveUsers = data.activeUsersGrowth > 0 
        ? Math.round(data.activeUsers / (1 + data.activeUsersGrowth / 100))
        : Math.round(data.activeUsers / (1 - Math.abs(data.activeUsersGrowth) / 100));
      
      console.log('昨日总活跃用户数:', yesterdayActiveUsers);
      
      return data;
    } else {
      console.log('❌ KPI接口调用失败:', response.data.message);
      return null;
    }
  } catch (error) {
    console.log('❌ KPI接口调用错误:', error.message);
    return null;
  }
}

// 运行测试
async function runTest() {
  console.log('开始测试活跃用户数...\n');
  
  // 先登录获取token
  const loginSuccess = await login();
  
  if (loginSuccess) {
    await testActiveUsers();
  }
}

runTest();