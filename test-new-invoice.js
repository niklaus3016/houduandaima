const axios = require('axios');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

async function testNewInvoiceUpload() {
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
    
    // 获取待处理的核销申请
    console.log('========================================');
    console.log('步骤2：获取待处理的核销申请');
    console.log('========================================');
    const pendingResponse = await axios.get(`${API_BASE_URL}/verification/admin/pending?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('待处理核销申请:');
    console.log(JSON.stringify(pendingResponse.data, null, 2));
    
    if (pendingResponse.data.data.records.length > 0) {
      const latestRecord = pendingResponse.data.data.records[0];
      console.log('\n最新的核销申请:');
      console.log('ID:', latestRecord.id);
      console.log('金额:', latestRecord.amount);
      console.log('状态:', latestRecord.status);
      console.log('员工ID:', latestRecord.employeeId);
      console.log('发票URL:', latestRecord.invoiceUrl);
      console.log('拒绝原因:', latestRecord.rejectReason);
      console.log('支付宝姓名:', latestRecord.alipayName);
      console.log('支付宝账号:', latestRecord.alipayAccount);
      
      // 检查invoiceUrl是否为相对路径
      if (latestRecord.invoiceUrl) {
        if (!latestRecord.invoiceUrl.startsWith('/home/')) {
          console.log('✅ invoiceUrl是相对路径:', latestRecord.invoiceUrl);
          
          // 测试静态文件服务
          console.log('\n========================================');
          console.log('步骤3：测试静态文件服务');
          console.log('========================================');
          const fileUrl = `https://wfqmaepvjkdd.sealoshzh.site${latestRecord.invoiceUrl}`;
          console.log('测试发票文件URL:', fileUrl);
          
          try {
            const fileResponse = await axios.get(fileUrl, { responseType: 'arraybuffer' });
            console.log('✅ 静态文件服务正常，文件大小:', fileResponse.data.length, '字节');
            console.log('✅ 发票文件可以正常访问');
          } catch (error) {
            console.log('❌ 静态文件服务错误:', error.response?.status || error.message);
          }
        } else {
          console.log('❌ invoiceUrl不是相对路径:', latestRecord.invoiceUrl);
        }
      } else {
        console.log('❌ 没有发票URL');
      }
    } else {
      console.log('❌ 没有待处理的核销申请');
    }
    
    console.log('');
    console.log('========================================');
    console.log('测试完成');
    console.log('========================================');
    
  } catch (error) {
    console.error('测试失败:', error.response?.data || error.message);
  }
}

testNewInvoiceUpload();
