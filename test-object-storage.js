const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

async function testFileUpload() {
  try {
    // 1. 用户登录
    console.log('========================================');
    console.log('步骤1：用户登录');
    console.log('========================================');
    
    const userLoginResponse = await axios.post(`${API_BASE_URL}/employee/check`, {
      employeeId: '1111'
    });
    
    const userToken = userLoginResponse.data.token;
    console.log('✅ 用户登录成功\n');
    
    // 2. 准备测试文件
    console.log('========================================');
    console.log('步骤2：准备测试文件');
    console.log('========================================');
    
    // 创建一个简单的测试文件
    const testFilePath = path.join(__dirname, 'test-invoice.png');
    
    // 生成一个简单的文本文件（模拟图片）
    fs.writeFileSync(testFilePath, 'This is a test invoice file');
    console.log('✅ 测试文件创建成功\n');
    
    // 3. 提交核销申请
    console.log('========================================');
    console.log('步骤3：提交核销申请');
    console.log('========================================');
    
    const formData = new FormData();
    formData.append('amount', '100');
    formData.append('alipayName', '测试用户');
    formData.append('alipayAccount', 'test@example.com');
    formData.append('invoiceFile', fs.createReadStream(testFilePath));
    
    const submitResponse = await axios.post(`${API_BASE_URL}/verification/submit`, formData, {
      headers: {
        'Authorization': `Bearer ${userToken}`,
        ...formData.getHeaders()
      }
    });
    
    console.log('提交核销申请结果:');
    console.log(JSON.stringify(submitResponse.data, null, 2));
    
    if (submitResponse.data.success) {
      console.log('✅ 核销申请提交成功');
      
      // 4. 获取核销记录
      console.log('\n========================================');
      console.log('步骤4：获取核销记录');
      console.log('========================================');
      
      const recordsResponse = await axios.get(`${API_BASE_URL}/verification/records?page=1&limit=10`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      
      console.log('核销记录:');
      console.log(JSON.stringify(recordsResponse.data, null, 2));
      
      if (recordsResponse.data.data.records.length > 0) {
        const latestRecord = recordsResponse.data.data.records[0];
        console.log('\n最新的核销记录:');
        console.log('ID:', latestRecord.id);
        console.log('金额:', latestRecord.amount);
        console.log('状态:', latestRecord.status);
        console.log('发票URL:', latestRecord.invoiceUrl);
        console.log('拒绝原因:', latestRecord.rejectReason);
        console.log('支付宝姓名:', latestRecord.alipayName);
        console.log('支付宝账号:', latestRecord.alipayAccount);
        
        // 检查发票URL是否为对象存储的URL
        if (latestRecord.invoiceUrl && latestRecord.invoiceUrl.includes('objectstorageapi.hzh.sealos.run')) {
          console.log('✅ 发票URL是对象存储的URL');
          
          // 测试发票文件是否可访问
          console.log('\n========================================');
          console.log('步骤5：测试发票文件访问');
          console.log('========================================');
          
          try {
            const fileResponse = await axios.get(latestRecord.invoiceUrl, { responseType: 'arraybuffer' });
            console.log('✅ 发票文件可以正常访问');
            console.log('文件大小:', fileResponse.data.length, '字节');
          } catch (error) {
            console.log('❌ 发票文件访问失败:', error.response?.status || error.message);
          }
        } else {
          console.log('❌ 发票URL不是对象存储的URL');
        }
      }
    }
    
    // 清理测试文件
    fs.unlinkSync(testFilePath);
    console.log('\n✅ 测试文件清理完成');
    
    console.log('');
    console.log('========================================');
    console.log('测试完成');
    console.log('========================================');
    
  } catch (error) {
    console.error('测试失败:', error.response?.data || error.message);
    
    // 清理测试文件
    const testFilePath = path.join(__dirname, 'test-invoice.png');
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  }
}

testFileUpload();
