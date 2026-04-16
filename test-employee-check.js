const axios = require('axios');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

async function testEmployeeCheck() {
  try {
    console.log('测试员工登录接口...\n');
    
    const response = await axios.post(`${API_BASE_URL}/employee/check`, {
      employeeId: '1111'
    });
    
    console.log('登录成功！');
    console.log('返回数据:');
    console.log(JSON.stringify(response.data, null, 2));
    
    if (response.data.token) {
      console.log('\n✅ Token已返回');
      console.log(`Token: ${response.data.token.substring(0, 20)}...`);
      
      // 测试使用token调用周进度接口
      console.log('\n测试使用token调用周进度接口...');
      const progressResponse = await axios.get(`${API_BASE_URL}/weeklyBonus/progress`, {
        headers: { Authorization: `Bearer ${response.data.token}` }
      });
      
      console.log('周进度数据:');
      console.log(JSON.stringify(progressResponse.data, null, 2));
    } else {
      console.log('\n❌ Token未返回');
    }
    
  } catch (error) {
    console.error('测试失败:', error.response?.data || error.message);
  }
}

testEmployeeCheck();
