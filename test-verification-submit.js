const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

async function testVerificationSubmit() {
  try {
    // 1. 用户登录
    console.log('========================================');
    console.log('步骤1：用户登录');
    console.log('========================================');
    
    const userLoginResponse = await axios.post(`${API_BASE_URL}/employee/check`, {
      employeeId: '1111'
    });
    
    const userToken = userLoginResponse.data.token;
    console.log('✅ 用户登录成功');
    console.log('Token:', userToken.substring(0, 50) + '...');
    
    // 2. 准备测试文件
    console.log('\n========================================');
    console.log('步骤2：准备测试文件');
    console.log('========================================');
    
    // 创建一个简单的测试文件
    const testFilePath = path.join(__dirname, 'test-invoice.jpg');
    
    // 生成一个简单的二进制文件（模拟图片）
    const buffer = Buffer.alloc(1024, 'test invoice content');
    fs.writeFileSync(testFilePath, buffer);
    console.log('✅ 测试文件创建成功');
    console.log('文件路径:', testFilePath);
    console.log('文件大小:', fs.statSync(testFilePath).size, '字节');
    
    // 3. 提交核销申请
    console.log('\n========================================');
    console.log('步骤3：提交核销申请');
    console.log('========================================');
    
    const formData = new FormData();
    formData.append('amount', '50');
    formData.append('alipayName', '测试用户');
    formData.append('alipayAccount', 'test@example.com');
    formData.append('invoiceFile', fs.createReadStream(testFilePath));
    
    console.log('准备发送请求...');
    console.log('请求URL:', `${API_BASE_URL}/verification/submit`);
    
    const submitResponse = await axios.post(`${API_BASE_URL}/verification/submit`, formData, {
      headers: {
        'Authorization': `Bearer ${userToken}`,
        ...formData.getHeaders()
      },
      timeout: 30000 // 30秒超时
    });
    
    console.log('\n提交核销申请结果:');
    console.log(JSON.stringify(submitResponse.data, null, 2));
    
    if (submitResponse.data.success) {
      console.log('\n✅ 核销申请提交成功');
      console.log('验证ID:', submitResponse.data.verificationId);
      
      // 4. 获取核销记录
      console.log('\n========================================');
      console.log('步骤4：获取核销记录');
      console.log('========================================');
      
      const recordsResponse = await axios.get(`${API_BASE_URL}/verification/records?page=1&limit=5`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      
      console.log('\n最近5条核销记录:');
      recordsResponse.data.data.records.forEach((record, index) => {
        console.log(`\n记录 ${index + 1}:`);
        console.log('ID:', record.id);
        console.log('金额:', record.amount);
        console.log('状态:', record.status);
        console.log('发票URL:', record.invoiceUrl);
        console.log('支付宝姓名:', record.alipayName);
        console.log('支付宝账号:', record.alipayAccount);
      });
    } else {
      console.log('\n❌ 核销申请提交失败');
    }
    
    // 清理测试文件
    fs.unlinkSync(testFilePath);
    console.log('\n✅ 测试文件清理完成');
    
    console.log('\n========================================');
    console.log('测试完成');
    console.log('========================================');
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
    console.error('错误堆栈:', error.stack);
    
    // 清理测试文件
    const testFilePath = path.join(__dirname, 'test-invoice.jpg');
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  }
}

testVerificationSubmit();
