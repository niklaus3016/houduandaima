#!/bin/bash

# 部署脚本 - 自动完成文件上传功能的部署

echo "开始部署文件上传功能..."

# 1. 更新依赖
echo "更新依赖..."
npm install

# 2. 创建上传目录
echo "创建上传目录..."
mkdir -p uploads/invoices
chmod 755 uploads
chmod 755 uploads/invoices

# 3. 检查配置文件
echo "检查配置文件..."
if [ -f "services/storage.js" ]; then
  echo "✓ storage.js 文件存在"
  # 检查是否包含阿里云OSS配置
  if grep -q "ali-oss" services/storage.js; then
    echo "✓ 已配置阿里云OSS"
  else
    echo "✗ 未配置阿里云OSS"
    exit 1
  fi
else
  echo "✗ storage.js 文件不存在"
  exit 1
fi

# 4. 重启服务
echo "重启服务..."
# 假设使用pm2管理服务
if command -v pm2 &> /dev/null; then
  pm2 restart app.js
  echo "✓ 服务已重启"
else
  echo "⚠ pm2 未安装，需要手动重启服务"
  echo "建议使用: node app.js 或配置pm2"
fi

echo "部署完成！"
echo "请使用前端测试文件上传功能"
