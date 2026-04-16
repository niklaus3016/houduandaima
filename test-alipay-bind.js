const axios = require('axios');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';
const EMPLOYEE_ID = '1111';
const PASSWORD = '1111';

let userToken = '';

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
      userToken = response.data.token;
      console.log('✅ 用户登录成功，获取到token');
      return true;
    } else {
      console.error('❌ 用户登录失败:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ 用户登录错误:', error.message);
    return false;
  }
}

async function testBindAlipay() {
  console.log('\n========================================');
  console.log('测试绑定支付宝信息');
  console.log('========================================');
  
  try {
    const response = await axios.post(`${API_BASE_URL}/welfare/bind-alipay`, {
      userId: '1',
      employeeId: EMPLOYEE_ID,
      alipayName: '测试用户',
      alipayAccount: 'test@example.com'
    }, {
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    });
    
    if (response.data.success) {
      console.log('✅ 绑定支付宝信息成功');
      console.log('支付宝信息:', response.data.data);
      return true;
    } else {
      console.error('❌ 绑定支付宝信息失败:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ 绑定支付宝信息错误:', error.message);
    return false;
  }
}

async function testGetAlipay() {
  console.log('\n========================================');
  console.log('测试获取绑定的支付宝信息');
  console.log('========================================');
  
  try {
    const response = await axios.get(`${API_BASE_URL}/welfare/get-alipay`, {
      headers: {
        'Authorization': `Bearer ${userToken}`
      },
      params: {
        userId: '1',
        employeeId: EMPLOYEE_ID
      }
    });
    
    if (response.data.success) {
      console.log('✅ 获取绑定的支付宝信息成功');
      console.log('支付宝信息:', response.data.data);
      return true;
    } else {
      console.error('❌ 获取绑定的支付宝信息失败:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ 获取绑定的支付宝信息错误:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('========================================');
  console.log('开始测试支付宝绑定功能');
  console.log('========================================');
  
  if (await testUserLogin()) {
    await testBindAlipay();
    await testGetAlipay();
  }
  
  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================');
}

runTests();
