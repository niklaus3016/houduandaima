const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// 测试部署后的文件上传功能
async function testDeployedUpload() {
  try {
    // 首先登录获取token
    const loginResponse = await axios.post('https://wfqmaepvjkdd.sealoshzh.site/api/auth/login', {
      employeeId: '1111',
      password: '123456'
    });
    
    if (!loginResponse.data.success) {
      console.error('登录失败:', loginResponse.data.message);
      return;
    }
    
    const token = loginResponse.data.token;
    console.log('登录成功，获取到token');
    
    // 创建表单数据
    const formData = new FormData();
    formData.append('amount', '100');
    formData.append('alipayName', '测试用户');
    formData.append('alipayAccount', 'test@example.com');
    
    // 创建一个临时测试文件
    const testFilePath = path.join(__dirname, 'test-deployed.txt');
    fs.writeFileSync(testFilePath, '测试部署后的文件上传功能');
    
    // 添加文件到表单
    formData.append('invoiceFile', fs.createReadStream(testFilePath));
    
    // 发送请求
    console.log('开始上传文件到部署后的服务器...');
    const response = await axios.post('https://wfqmaepvjkdd.sealoshzh.site/api/verification/submit', formData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        ...formData.getHeaders()
      },
      timeout: 60000
    });
    
    console.log('上传成功:', response.data);
    
    // 清理测试文件
    fs.unlinkSync(testFilePath);
    
    console.log('测试完成，文件上传功能正常！');
    
  } catch (error) {
    console.error('上传失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    } else if (error.request) {
      console.error('请求发送失败:', error.request);
    }
    
    // 清理测试文件
    const testFilePath = path.join(__dirname, 'test-deployed.txt');
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  }
}

// 运行测试
testDeployedUpload();