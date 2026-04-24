const axios = require('axios');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

async function test() {
  try {
    const teamId = '69b116a5c9e0f0e16c46ba2c';

    console.log('=== 测试员工列表接口 ===');
    console.log(`teamId: ${teamId}`);

    const response = await axios.get(`${API_BASE_URL}/admin/employee/employees-simple?teamId=${teamId}`, {
      timeout: 10000
    });

    console.log(`返回数据条数: ${response.data.data.length}`);

    const emp7579 = response.data.data.find(e => e.employeeId === '7579');
    if (emp7579) {
      console.log('找到员工7579:', JSON.stringify(emp7579, null, 2));
    } else {
      console.log('❌ 未找到员工7579');
      console.log('前10个员工:', response.data.data.slice(0, 10).map(e => e.employeeId).join(', '));
      console.log('后10个员工:', response.data.data.slice(-10).map(e => e.employeeId).join(', '));
    }
  } catch (err) {
    console.error('请求失败:', err.message);
    if (err.response) {
      console.error('状态码:', err.response.status);
      console.error('响应:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

test();