const axios = require('axios');

async function test() {
  try {
    // 测试几个可能的路�
    const paths = [
      '/api/admin/weekly-target/get',
      '/api/weekly-target/get',
      '/admin/weekly-target/get'
    ];

    for (const path of paths) {
      try {
        console.log(`\n测试: ${path}`);
        const response = await axios.get(`https://wfqmaepvjkdd.sealoshzh.site${path}`, {
          timeout: 10000
        });
        console.log('状态:', response.status);
        console.log('返回:', JSON.stringify(response.data, null, 2));
      } catch (err) {
        if (err.response) {
          console.log('状态:', err.response.status);
        } else {
          console.log('错误:', err.message);
        }
      }
    }
  } catch (err) {
    console.error('请求失败:', err.message);
  }
}

test();