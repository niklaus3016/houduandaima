const axios = require('axios');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

async function testVerificationAPIs() {
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
    
    // 测试统计接口
    console.log('========================================');
    console.log('步骤2：测试统计接口');
    console.log('========================================');
    const statsResponse = await axios.get(`${API_BASE_URL}/verification/admin/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('统计数据:');
    console.log(JSON.stringify(statsResponse.data, null, 2));
    
    if (statsResponse.data.data.pendingAmount !== undefined) {
      console.log('✅ 统计接口返回了各状态的金额');
    } else {
      console.log('❌ 统计接口未返回各状态的金额');
    }
    console.log('');
    
    // 测试待处理核销申请接口
    console.log('========================================');
    console.log('步骤3：测试待处理核销申请接口');
    console.log('========================================');
    const pendingResponse = await axios.get(`${API_BASE_URL}/verification/admin/pending?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('待处理核销申请:');
    console.log(JSON.stringify(pendingResponse.data, null, 2));
    
    if (pendingResponse.data.data.records.length > 0) {
      const firstRecord = pendingResponse.data.data.records[0];
      if (firstRecord.alipayName !== undefined && firstRecord.alipayAccount !== undefined) {
        console.log('✅ 待处理接口返回了alipayName和alipayAccount字段');
      } else {
        console.log('❌ 待处理接口未返回alipayName和alipayAccount字段');
      }
    }
    console.log('');
    
    // 测试已处理核销记录接口
    console.log('========================================');
    console.log('步骤4：测试已处理核销记录接口');
    console.log('========================================');
    try {
      const listResponse = await axios.get(`${API_BASE_URL}/verification/admin/list?page=1&limit=10`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('已处理核销记录:');
      console.log(JSON.stringify(listResponse.data, null, 2));
      
      if (listResponse.data.data.records.length > 0) {
        const firstRecord = listResponse.data.data.records[0];
        if (firstRecord.alipayName !== undefined && firstRecord.alipayAccount !== undefined) {
          console.log('✅ 已处理接口返回了alipayName和alipayAccount字段');
        } else {
          console.log('❌ 已处理接口未返回alipayName和alipayAccount字段');
        }
      }
    } catch (error) {
      console.log('❌ 已处理核销记录接口错误:', error.response?.status || error.message);
    }
    console.log('');
    
    // 测试已拒绝状态的记录
    console.log('========================================');
    console.log('步骤5：测试已拒绝状态的记录');
    console.log('========================================');
    try {
      const rejectedResponse = await axios.get(`${API_BASE_URL}/verification/admin/list?status=rejected&page=1&limit=10`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('已拒绝记录:');
      console.log(JSON.stringify(rejectedResponse.data, null, 2));
      
      if (rejectedResponse.data.data.records.length > 0) {
        console.log('✅ 已拒绝状态接口正常工作');
      } else {
        console.log('⚠️  没有已拒绝的记录');
      }
    } catch (error) {
      console.log('❌ 已拒绝状态接口错误:', error.response?.status || error.message);
    }
    console.log('');
    
    // 测试用户核销记录接口
    console.log('========================================');
    console.log('步骤6：测试用户核销记录接口');
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
      if (firstRecord.alipayName !== undefined && firstRecord.alipayAccount !== undefined) {
        console.log('✅ 用户核销记录接口返回了alipayName和alipayAccount字段');
      } else {
        console.log('❌ 用户核销记录接口未返回alipayName和alipayAccount字段');
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

testVerificationAPIs();
