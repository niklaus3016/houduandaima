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

// 恢复用户2222的金币数据
async function restoreUserGold() {
  try {
    console.log('恢复用户2222的金币数据...');
    const response = await axios.post(`${baseURL}/api/gold/admin/adjust`, {
      employeeId: '2222',
      currentMonthGold: 936598.535505245,
      lastMonthGold: 2329023.4711880614,
      reason: '恢复原始金币数据'
    }, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    console.log('恢复用户2222金币数据成功:', response.data);
  } catch (error) {
    console.error('恢复用户2222金币数据失败:', error.response?.data || error.message);
  }
}

// 验证恢复后的金币数据
async function verifyRestoredGold() {
  try {
    console.log('验证用户2222的金币数据...');
    const response = await axios.get(`${baseURL}/api/gold/admin/user/2222`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    console.log('验证用户2222金币数据成功:', response.data);
  } catch (error) {
    console.error('验证用户2222金币数据失败:', error.response?.data || error.message);
  }
}

// 运行恢复
async function runRestore() {
  console.log('开始恢复用户2222的金币数据...\n');
  
  await testAdminLogin();
  console.log('');
  
  await restoreUserGold();
  console.log('');
  
  await verifyRestoredGold();
  console.log('');
  
  console.log('恢复完成！');
}

runRestore();
