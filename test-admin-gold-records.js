const axios = require('axios');

const API_BASE_URL = 'http://localhost:3003/api';

async function testAdminGoldRecords() {
  try {
    console.log('=== 测试超管手动添加金币记录接口 ===\n');

    // 先登录获取token
    const loginResponse = await axios.post(`${API_BASE_URL}/admin/login`, {
      username: 'admin',
      password: 'admin123'
    });

    const token = loginResponse.data.data.token;
    console.log('登录成功，获取到token\n');

    // 测试4月的记录
    console.log('========================================');
    console.log('测试4月份的金币记录');
    console.log('========================================');
    const aprilResponse = await axios.get(`${API_BASE_URL}/admin/admin-gold-records`, {
      params: { month: '2026-04' },
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('4月返回数据:');
    console.log(JSON.stringify(aprilResponse.data, null, 2));

    // 测试5月的记录
    console.log('\n========================================');
    console.log('测试5月份的金币记录');
    console.log('========================================');
    const mayResponse = await axios.get(`${API_BASE_URL}/admin/admin-gold-records`, {
      params: { month: '2026-05' },
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('5月返回数据:');
    console.log(JSON.stringify(mayResponse.data, null, 2));

  } catch (error) {
    console.error('测试失败:', error.response?.data || error.message);
  }
}

testAdminGoldRecords();