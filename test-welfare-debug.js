const axios = require('axios');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';
const EMPLOYEE_ID = '1111';
const PASSWORD = '1111';

async function testUserLogin() {
  console.log('========================================');
  console.log('测试用户登录');
  console.log('========================================');
  
  try {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      employeeId: EMPLOYEE_ID,
      password: PASSWORD
    });
    
    if (response.data.success) {
      console.log('✅ 用户登录成功');
      console.log('Token:', response.data.token);
      return response.data.token;
    } else {
      console.error('❌ 用户登录失败:', response.data.message);
      return null;
    }
  } catch (error) {
    console.error('❌ 用户登录错误:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
    return null;
  }
}

async function testGetWelfareInfo(token) {
  console.log('\n========================================');
  console.log('测试获取福利抽奖信息');
  console.log('========================================');
  
  try {
    console.log('请求URL:', `${API_BASE_URL}/welfare/lottery/info`);
    console.log('请求参数:', { userId: '1', employeeId: EMPLOYEE_ID });
    console.log('请求头:', { Authorization: `Bearer ${token}` });
    
    const response = await axios.get(`${API_BASE_URL}/welfare/lottery/info`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        userId: '1',
        employeeId: EMPLOYEE_ID
      }
    });
    
    if (response.data.success) {
      console.log('✅ 获取福利抽奖信息成功');
      console.log('余额:', response.data.data.balance, '元');
      console.log('抽奖机会:', response.data.data.chances, '次');
      return response.data.data;
    } else {
      console.error('❌ 获取福利抽奖信息失败:', response.data.message);
      return null;
    }
  } catch (error) {
    console.error('❌ 获取福利抽奖信息错误:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
      console.error('响应头:', error.response.headers);
    }
    return null;
  }
}

async function testGetWalletBalance(token) {
  console.log('\n========================================');
  console.log('测试获取福利钱包余额');
  console.log('========================================');
  
  try {
    console.log('请求URL:', `${API_BASE_URL}/welfare/wallet/balance`);
    console.log('请求参数:', { userId: '1', employeeId: EMPLOYEE_ID });
    console.log('请求头:', { Authorization: `Bearer ${token}` });
    
    const response = await axios.get(`${API_BASE_URL}/welfare/wallet/balance`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        userId: '1',
        employeeId: EMPLOYEE_ID
      }
    });
    
    if (response.data.success) {
      console.log('✅ 获取福利钱包余额成功');
      console.log('余额:', response.data.data.balance, '元');
      return response.data.data;
    } else {
      console.error('❌ 获取福利钱包余额失败:', response.data.message);
      return null;
    }
  } catch (error) {
    console.error('❌ 获取福利钱包余额错误:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
      console.error('响应头:', error.response.headers);
    }
    return null;
  }
}

async function runTests() {
  console.log('========================================');
  console.log('开始测试福利钱包查询接口');
  console.log('========================================');
  
  const token = await testUserLogin();
  
  if (token) {
    await testGetWelfareInfo(token);
    await testGetWalletBalance(token);
  }
  
  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================');
}

runTests();
