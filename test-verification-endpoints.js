const axios = require('axios');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site';

async function testVerificationEndpoints() {
  try {
    // 超管登录
    console.log('超管登录中...');
    const loginResponse = await axios.post(`${API_BASE_URL}/api/auth/login`, {
      employeeId: 'admin',
      password: 'admin123456'
    });
    
    const token = loginResponse.data.token;
    console.log('登录成功\n');
    
    // 测试待处理核销申请接口
    console.log('测试待处理核销申请接口...');
    const pendingResponse = await axios.get(`${API_BASE_URL}/api/verification/admin/pending?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('待处理核销申请状态:', pendingResponse.status);
    console.log('\n');
    
    // 测试已处理核销记录接口
    console.log('测试已处理核销记录接口...');
    try {
      const listResponse = await axios.get(`${API_BASE_URL}/api/verification/admin/list?page=1&limit=10`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('已处理核销记录状态:', listResponse.status);
    } catch (error) {
      console.log('已处理核销记录错误:', error.response?.status || error.message);
    }
    
    // 测试用户核销记录接口
    console.log('\n测试用户核销记录接口...');
    const recordsResponse = await axios.get(`${API_BASE_URL}/api/verification/records?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('用户核销记录状态:', recordsResponse.status);
    console.log('\n');
    
  } catch (error) {
    console.error('测试失败:', error.response?.data || error.message);
  }
}

testVerificationEndpoints();
