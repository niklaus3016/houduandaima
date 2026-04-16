const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

// 测试配置
const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';
const EMPLOYEE_ID = '1111';
const PASSWORD = '1111';

async function testSimpleUpload() {
  console.log('========================================');
  console.log('简单测试文件上传');
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

      // 步骤2：创建一个简单的文本文件
      console.log('\n步骤2：创建测试文件');
      console.log('========================================');
      
      const testFilePath = '/home/devbox/project/test-upload.txt';
      fs.writeFileSync(testFilePath, 'Test file content for upload');
      console.log('✅ 测试文件创建成功');
      console.log('文件路径:', testFilePath);
      console.log('文件大小:', fs.statSync(testFilePath).size, '字节');

      // 步骤3：提交核销申请，上传文件
      console.log('\n步骤3：提交核销申请，上传文件');
      console.log('========================================');
      
      const formData = new FormData();
      formData.append('amount', '100');
      formData.append('alipayName', '测试用户');
      formData.append('alipayAccount', 'test@example.com');
      formData.append('invoiceFile', fs.createReadStream(testFilePath));

      console.log('准备发送请求...');
      console.log('请求URL:', `${API_BASE_URL}/verification/submit`);
      console.log('请求数据:', {
        amount: '100',
        alipayName: '测试用户',
        alipayAccount: 'test@example.com',
        invoiceFile: 'test-upload.txt'
      });

      const submitResponse = await axios.post(`${API_BASE_URL}/verification/submit`, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          ...formData.getHeaders()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 30000 // 30秒超时
      });

      console.log('\n响应状态:', submitResponse.status);
      console.log('响应数据:', JSON.stringify(submitResponse.data, null, 2));

      if (submitResponse.data.success) {
        console.log('✅ 核销申请提交成功');
        console.log('验证ID:', submitResponse.data.verificationId);
      } else {
        console.error('❌ 提交核销申请失败:', submitResponse.data.message);
        console.error('错误详情:', submitResponse.data.error || '无');
      }

      // 清理测试文件
      console.log('\n步骤4：清理测试文件');
      console.log('========================================');
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
        console.log('✅ 测试文件清理完成');
      }

    } else {
      console.error('❌ 登录失败:', loginResponse.data.message);
    }

  } catch (error) {
    console.error('❌ 测试过程中出现错误:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', JSON.stringify(error.response.data, null, 2));
      console.error('响应头:', error.response.headers);
    } else if (error.request) {
      console.error('请求已发送但未收到响应:', error.request);
    } else {
      console.error('请求配置错误:', error.message);
      console.error('错误堆栈:', error.stack);
    }
  }

  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================');
}

testSimpleUpload();
