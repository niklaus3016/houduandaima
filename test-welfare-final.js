const axios = require('axios');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';
const EMPLOYEE_ID = '1111';

async function testEmployeeLogin() {
  console.log('========================================');
  console.log('测试员工无密码登录');
  console.log('========================================');
  
  const response = await axios.post(`${API_BASE_URL}/auth/login`, {
    employeeId: EMPLOYEE_ID
  });
  
  if (response.data.success) {
    console.log('✅ 登录成功');
    return response.data;
  } else {
    throw new Error('登录失败: ' + response.data.message);
  }
}

async function testGetWelfareInfo(token, employeeId) {
  console.log('\n========================================');
  console.log('测试获取福利抽奖信息');
  console.log('========================================');
  
  const response = await axios.get(`${API_BASE_URL}/welfare/lottery/info`, {
    headers: {
      'Authorization': `Bearer ${token}`
    },
    params: {
      employeeId: employeeId
    }
  });
  
  if (response.data.success) {
    console.log('✅ 获取福利抽奖信息成功');
    console.log('余额:', response.data.data.balance, '元');
    console.log('抽奖机会:', response.data.data.chances, '次');
    return response.data;
  } else {
    throw new Error('获取福利抽奖信息失败: ' + response.data.message);
  }
}

async function testGetWalletBalance(token, employeeId) {
  console.log('\n========================================');
  console.log('测试获取福利钱包余额');
  console.log('========================================');
  
  const response = await axios.get(`${API_BASE_URL}/welfare/wallet/balance`, {
    headers: {
      'Authorization': `Bearer ${token}`
    },
    params: {
      employeeId: employeeId
    }
  });
  
  if (response.data.success) {
    console.log('✅ 获取福利钱包余额成功');
    console.log('余额:', response.data.data.balance, '元');
    return response.data;
  } else {
    throw new Error('获取福利钱包余额失败: ' + response.data.message);
  }
}

async function runTests() {
  console.log('========================================');
  console.log('开始测试福利钱包接口（只需要employeeId）');
  console.log('========================================');
  
  try {
    // 1. 登录
    const loginData = await testEmployeeLogin();
    const token = loginData.token;
    const employeeId = loginData.user.employeeId;
    
    // 2. 获取福利抽奖信息
    await testGetWelfareInfo(token, employeeId);
    
    // 3. 获取福利钱包余额
    await testGetWalletBalance(token, employeeId);
    
    console.log('\n========================================');
    console.log('✅ 所有测试通过');
    console.log('========================================');
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
  }
}

runTests();
