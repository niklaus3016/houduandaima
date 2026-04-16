const axios = require('axios');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';
const EMPLOYEE_ID = '1111';

async function testEmployeeLoginWithoutPassword() {
  console.log('========================================');
  console.log('测试员工无密码登录');
  console.log('========================================');
  
  try {
    // 方式1：只传递employeeId
    console.log('\n方式1：只传递employeeId');
    const response1 = await axios.post(`${API_BASE_URL}/auth/login`, {
      employeeId: EMPLOYEE_ID
    });
    
    if (response1.data.success) {
      console.log('✅ 登录成功');
      console.log('Token:', response1.data.token);
      console.log('用户信息:', response1.data.user);
      
      // 测试获取福利钱包信息
      const token = response1.data.token;
      const userInfo = response1.data.user;
      
      console.log('\n测试获取福利钱包信息:');
      const welfareResponse = await axios.get(`${API_BASE_URL}/welfare/lottery/info`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          userId: userInfo.userId,
          employeeId: userInfo.employeeId
        }
      });
      
      if (welfareResponse.data.success) {
        console.log('✅ 获取福利钱包信息成功');
        console.log('余额:', welfareResponse.data.data.balance, '元');
        console.log('抽奖机会:', welfareResponse.data.data.chances, '次');
      }
    } else {
      console.error('❌ 登录失败:', response1.data.message);
    }
  } catch (error) {
    console.error('❌ 测试错误:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
  }
  
  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================');
}

testEmployeeLoginWithoutPassword();
