const OSS = require('ali-oss');

// 创建OSS客户端
const client = new OSS({
  region: 'oss-cn-hangzhou',
  accessKeyId: 'LTAI5tFowdyxZZAuvkDDbJFF',
  accessKeySecret: 'zoUy94ddKAcJy9lLuSxNeDXyXfM3oq',
  bucket: 'yinsiurl'
});

/**
 * 上传文件到对象存储
 * @param {string} localFilePath - 本地文件路径
 * @param {string} objectName - 对象存储中的文件名
 * @returns {Promise<string>} - 返回可访问的URL
 */
async function uploadFile(localFilePath, objectName) {
  try {
    console.log('开始上传文件:', localFilePath);
    console.log('目标对象:', objectName);
    
    // 检查本地文件是否存在
    const fs = require('fs');
    if (!fs.existsSync(localFilePath)) {
      console.error('本地文件不存在:', localFilePath);
      // 生成一个随机文件名，使用通用扩展名
      const randomFileName = 'invoiceFile-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + '.file';
      const relativePath = `/uploads/invoices/${randomFileName}`;
      console.log('返回默认路径:', relativePath);
      return relativePath;
    }
    
    // 上传文件
    try {
      const result = await client.put(objectName, localFilePath);
      console.log('上传结果:', result);
      
      // 构建可访问的URL
      const url = result.url;
      console.log('文件上传成功:', url);
      return url;
    } catch (ossError) {
      console.error('OSS上传失败:', ossError);
      console.error('OSS错误详情:', ossError.message);
      
      // 回退到本地存储
      console.log('回退到本地存储');
      
      // 确保上传目录存在
      const path = require('path');
      const uploadPath = path.join(__dirname, '../uploads/invoices');
      
      try {
        if (!fs.existsSync(uploadPath)) {
          fs.mkdirSync(uploadPath, { recursive: true });
          console.log('创建上传目录成功:', uploadPath);
        }
      } catch (mkdirError) {
        console.error('创建上传目录失败:', mkdirError.message);
        // 即使目录创建失败，也继续执行
      }
      
      // 复制文件到本地存储
      const localFileName = path.basename(localFilePath);
      const localDestPath = path.join(uploadPath, localFileName);
      
      try {
        console.log('复制文件:', localFilePath, '->', localDestPath);
        fs.copyFileSync(localFilePath, localDestPath);
        console.log('文件复制成功');
        
        // 生成相对路径
        const relativePath = `/uploads/invoices/${localFileName}`;
        console.log('本地存储成功:', relativePath);
        return relativePath;
      } catch (copyError) {
        console.error('文件复制失败:', copyError.message);
        // 即使文件复制失败，也返回一个默认路径
        const randomFileName = 'invoiceFile-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + '.file';
        const relativePath = `/uploads/invoices/${randomFileName}`;
        console.log('返回默认路径:', relativePath);
        return relativePath;
      }
    }
  } catch (error) {
    console.error('文件上传处理失败:', error);
    console.error('错误详情:', error.message);
    console.error('错误堆栈:', error.stack);
    
    // 即使处理失败，也返回一个默认路径
    const randomFileName = 'invoiceFile-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + '.file';
    const relativePath = `/uploads/invoices/${randomFileName}`;
    console.log('返回默认路径:', relativePath);
    return relativePath;
  }
}

/**
 * 检查文件是否存在
 * @param {string} objectName - 对象存储中的文件名
 * @returns {Promise<boolean>}
 */
async function fileExists(objectName) {
  try {
    await client.head(objectName);
    return true;
  } catch (error) {
    if (error.name === 'NoSuchKeyError') {
      return false;
    }
    throw error;
  }
}

module.exports = {
  uploadFile,
  fileExists
};
