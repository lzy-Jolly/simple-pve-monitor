# 使用轻量级的 Python 3.10 镜像作为基础
FROM python:3.10-slim

# 设置工作目录
WORKDIR /pve

# 拷贝 requirements.txt 并安装依赖，利用 Docker 层缓存
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 拷贝所有项目文件到镜像中
COPY . .

# 暴露应用运行的端口，必须与 app.run() 中设置的端口一致
EXPOSE 8920

# 启动命令
CMD ["python", "app.py"]
# 生产环境更推荐使用