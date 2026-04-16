const axios = require('axios');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site';

async function testStaticFiles() {
  try {
    // 测试健康检查
    console.log('测试健康检查...');
    const healthResponse = await axios.get(`${API_BASE_URL}/`);
    console.log('健康检查:', healthResponse.data);
    console.log('');
    
    // 测试静态文件服务
    console.log('测试静态文件服务...');
    
    // 测试上传目录是否可访问
    try {
      const uploadsResponse = await axios.get(`${API_BASE_URL}/uploads/`);
      console.log('上传目录访问:', uploadsResponse.status);
    } catch (error) {
      console.log('上传目录访问:', error.response?.status || error.message);
    }
    
    // 测试发票文件是否可访问
    try {
      const invoiceResponse = await axios.get(`${API_BASE_URL}/uploads/invoices/invoiceFile-1776052874379-952681728.png`);
      console.log('发票文件访问:', invoiceResponse.status);
    } catch (error) {
      console.log('发票文件访问:', error.response?.status || error.message);
    }
    
    console.log('');
    console.log('测试完成');
    
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testStaticFiles();
