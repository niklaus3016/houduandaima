const axios = require('axios');

// 测试配置
const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';
const EMPLOYEE_ID = '1111';
const PASSWORD = '1111';

async function testUserGold() {
  console.log('========================================');
  console.log('测试用户金币信息');
  console.log('========================================');

  try {
    // 步骤1：用户登录
    console.log('\n步骤1：用户登录');
    console.log('========================================');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      employeeId: EMPLOYEE_ID,
      password: PASSWORD
    });

    if (loginResponse.data.success) {
      console.log('✅ 用户登录成功');
      const token = loginResponse.data.token;

      // 步骤2：获取用户金币信息
      console.log('\n步骤2：获取用户金币信息');
      console.log('========================================');
      const goldResponse = await axios.get(`${API_BASE_URL}/user/gold`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (goldResponse.data.success) {
        console.log('✅ 获取金币信息成功');
        console.log('金币信息:', goldResponse.data.data);
        
        const currentMonthGold = goldResponse.data.data.currentMonthGold;
        const lastMonthGold = goldResponse.data.data.lastMonthGold;
        const totalGold = goldResponse.data.data.totalGold;
        
        console.log(`当前月金币: ${currentMonthGold}`);
        console.log(`上月金币: ${lastMonthGold}`);
        console.log(`总金币: ${totalGold}`);
        
        // 检查金币是否足够
        const testAmount = 300;
        const requiredGold = testAmount * 1000;
        if (totalGold >= requiredGold) {
          console.log(`✅ 金币足够，测试金额 ${testAmount} 元需要 ${requiredGold} 金币`);
        } else {
          console.log(`⚠ 金币不足，测试金额 ${testAmount} 元需要 ${requiredGold} 金币，但只有 ${totalGold} 金币`);
        }

      } else {
        console.error('❌ 获取金币信息失败:', goldResponse.data.message);
      }

    } else {
      console.error('❌ 登录失败:', loginResponse.data.message);
    }

  } catch (error) {
    console.error('❌ 测试过程中出现错误:', error.message);
    console.error('错误详情:', error.response?.data || error.stack);
  }

  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================');
}

testUserGold();
