const axios = require('axios');

const baseURL = 'http://127.0.0.1:3003';
let adminToken = '';

// 测试超管登录
async function testAdminLogin() {
  try {
    console.log('测试超管登录...');
    const response = await axios.post(`${baseURL}/api/auth/login`, {
      employeeId: 'admin',
      password: 'admin123456'
    });
    console.log('超管登录成功:', response.data);
    adminToken = response.data.token;
  } catch (error) {
    console.error('超管登录失败:', error.response?.data || error.message);
  }
}

// 测试获取用户金币详情
async function testGetUserGoldDetail() {
  try {
    console.log('测试获取用户金币详情...');
    const response = await axios.get(`${baseURL}/api/gold/admin/user/1111`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    console.log('获取用户金币详情成功:', response.data);
  } catch (error) {
    console.error('获取用户金币详情失败:', error.response?.data || error.message);
  }
}

// 测试调整用户金币
async function testAdjustUserGold() {
  try {
    console.log('测试调整用户金币...');
    const response = await axios.post(`${baseURL}/api/gold/admin/adjust`, {
      employeeId: '1111',
      currentMonthGold: 1000000,
      lastMonthGold: 2000000,
      reason: '测试调整金币'
    }, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    console.log('调整用户金币成功:', response.data);
  } catch (error) {
    console.error('调整用户金币失败:', error.response?.data || error.message);
  }
}

// 测试调整后的用户金币详情
async function testAdjustedUserGoldDetail() {
  try {
    console.log('测试调整后的用户金币详情...');
    const response = await axios.get(`${baseURL}/api/gold/admin/user/1111`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    console.log('获取调整后的用户金币详情成功:', response.data);
  } catch (error) {
    console.error('获取调整后的用户金币详情失败:', error.response?.data || error.message);
  }
}

// 运行测试
async function runTests() {
  console.log('开始测试超管金币管理接口...\n');
  
  await testAdminLogin();
  console.log('');
  
  await testGetUserGoldDetail();
  console.log('');
  
  await testAdjustUserGold();
  console.log('');
  
  await testAdjustedUserGoldDetail();
  console.log('');
  
  console.log('测试完成！');
}

runTests();
