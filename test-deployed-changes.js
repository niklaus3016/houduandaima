const axios = require('axios');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

async function testDeployedChanges() {
  try {
    // 超管登录
    console.log('========================================');
    console.log('步骤1：超管登录');
    console.log('========================================');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      employeeId: 'admin',
      password: 'admin123456'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ 登录成功\n');
    
    // 测试已处理核销记录接口
    console.log('========================================');
    console.log('步骤2：测试已处理核销记录接口');
    console.log('========================================');
    const listResponse = await axios.get(`${API_BASE_URL}/verification/admin/list?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('已处理核销记录:');
    console.log(JSON.stringify(listResponse.data, null, 2));
    
    if (listResponse.data.data.records.length > 0) {
      const firstRecord = listResponse.data.data.records[0];
      
      // 检查rejectReason字段
      if (firstRecord.rejectReason !== undefined) {
        console.log('✅ 已处理接口返回了rejectReason字段');
      } else {
        console.log('❌ 已处理接口未返回rejectReason字段');
      }
      
      // 检查invoiceUrl是否为相对路径
      if (firstRecord.invoiceUrl && !firstRecord.invoiceUrl.startsWith('/home/')) {
        console.log('✅ invoiceUrl是相对路径:', firstRecord.invoiceUrl);
      } else {
        console.log('❌ invoiceUrl不是相对路径:', firstRecord.invoiceUrl);
      }
    }
    console.log('');
    
    // 测试已拒绝状态的记录
    console.log('========================================');
    console.log('步骤3：测试已拒绝状态的记录');
    console.log('========================================');
    const rejectedResponse = await axios.get(`${API_BASE_URL}/verification/admin/list?status=rejected&page=1&limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('已拒绝记录:');
    console.log(JSON.stringify(rejectedResponse.data, null, 2));
    
    if (rejectedResponse.data.data.records.length > 0) {
      const firstRecord = rejectedResponse.data.data.records[0];
      
      // 检查rejectReason字段
      if (firstRecord.rejectReason !== undefined) {
        console.log('✅ 已拒绝状态接口返回了rejectReason字段');
      } else {
        console.log('❌ 已拒绝状态接口未返回rejectReason字段');
      }
      
      // 检查invoiceUrl是否为相对路径
      if (firstRecord.invoiceUrl && !firstRecord.invoiceUrl.startsWith('/home/')) {
        console.log('✅ invoiceUrl是相对路径:', firstRecord.invoiceUrl);
      } else {
        console.log('❌ invoiceUrl不是相对路径:', firstRecord.invoiceUrl);
      }
    }
    console.log('');
    
    // 测试用户核销记录接口
    console.log('========================================');
    console.log('步骤4：测试用户核销记录接口');
    console.log('========================================');
    
    // 用户登录
    const userLoginResponse = await axios.post(`${API_BASE_URL}/employee/check`, {
      employeeId: '1111'
    });
    
    const userToken = userLoginResponse.data.token;
    console.log('✅ 用户登录成功\n');
    
    const userRecordsResponse = await axios.get(`${API_BASE_URL}/verification/records?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    
    console.log('用户核销记录:');
    console.log(JSON.stringify(userRecordsResponse.data, null, 2));
    
    if (userRecordsResponse.data.data.records.length > 0) {
      const firstRecord = userRecordsResponse.data.data.records[0];
      
      // 检查rejectReason字段
      if (firstRecord.rejectReason !== undefined) {
        console.log('✅ 用户核销记录接口返回了rejectReason字段');
      } else {
        console.log('❌ 用户核销记录接口未返回rejectReason字段');
      }
      
      // 检查invoiceUrl是否为相对路径
      if (firstRecord.invoiceUrl && !firstRecord.invoiceUrl.startsWith('/home/')) {
        console.log('✅ invoiceUrl是相对路径:', firstRecord.invoiceUrl);
      } else {
        console.log('❌ invoiceUrl不是相对路径:', firstRecord.invoiceUrl);
      }
    }
    console.log('');
    
    // 测试静态文件服务
    console.log('========================================');
    console.log('步骤5：测试静态文件服务');
    console.log('========================================');
    
    // 尝试获取一个发票文件
    if (listResponse.data.data.records.length > 0) {
      const firstRecord = listResponse.data.data.records[0];
      if (firstRecord.invoiceUrl) {
        const fileUrl = `https://wfqmaepvjkdd.sealoshzh.site${firstRecord.invoiceUrl}`;
        console.log('测试发票文件URL:', fileUrl);
        
        try {
          const fileResponse = await axios.get(fileUrl, { responseType: 'arraybuffer' });
          console.log('✅ 静态文件服务正常，文件大小:', fileResponse.data.length, '字节');
        } catch (error) {
          console.log('❌ 静态文件服务错误:', error.response?.status || error.message);
        }
      }
    }
    console.log('');
    
    console.log('========================================');
    console.log('测试完成');
    console.log('========================================');
    
  } catch (error) {
    console.error('测试失败:', error.response?.data || error.message);
  }
}

testDeployedChanges();
