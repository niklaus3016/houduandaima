const axios = require('axios');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

async function testVerificationAPI() {
  try {
    // 登录获取token
    console.log('登录中...');
    const loginResponse = await axios.post(`${API_BASE_URL}/employee/check`, {
      employeeId: '1111'
    });
    
    const token = loginResponse.data.token;
    console.log('登录成功\n');
    
    // 测试待处理核销申请接口
    console.log('测试待处理核销申请接口...');
    const pendingResponse = await axios.get(`${API_BASE_URL}/verification/admin/pending?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('待处理核销申请:');
    console.log(JSON.stringify(pendingResponse.data, null, 2));
    console.log('');
    
    // 测试已处理核销记录接口
    console.log('测试已处理核销记录接口...');
    const listResponse = await axios.get(`${API_BASE_URL}/verification/admin/list?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('已处理核销记录:');
    console.log(JSON.stringify(listResponse.data, null, 2));
    console.log('');
    
    // 测试用户核销记录接口
    console.log('测试用户核销记录接口...');
    const recordsResponse = await axios.get(`${API_BASE_URL}/verification/records?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('用户核销记录:');
    console.log(JSON.stringify(recordsResponse.data, null, 2));
    console.log('');
    
  } catch (error) {
    console.error('测试失败:', error.response?.data || error.message);
  }
}

testVerificationAPI();
