const axios = require('axios');

// 检查部署后的服务器状态
async function checkDeployedServer() {
  try {
    // 检查登录接口是否正常
    console.log('检查登录接口...');
    const loginResponse = await axios.post('https://wfqmaepvjkdd.sealoshzh.site/api/auth/login', {
      employeeId: '1111',
      password: '123456'
    });
    
    if (loginResponse.data.success) {
      console.log('登录接口正常');
      const token = loginResponse.data.token;
      
      // 尝试获取用户金币信息，检查其他接口是否正常
      console.log('检查用户金币接口...');
      const goldResponse = await axios.get('https://wfqmaepvjkdd.sealoshzh.site/api/user/gold', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (goldResponse.data.success) {
        console.log('用户金币接口正常');
        console.log('服务器基本功能正常，文件上传失败可能是由于依赖问题或配置问题');
      } else {
        console.error('用户金币接口失败:', goldResponse.data.message);
      }
    } else {
      console.error('登录接口失败:', loginResponse.data.message);
    }
    
  } catch (error) {
    console.error('检查服务器失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
  }
}

// 运行检查
checkDeployedServer();