# 使用轻量级的 Python 3.10 镜像作为基础
FROM python:3.10-slim

# 设置工作目录
WORKDIR /pve

# 先拷贝项目代码
COPY . .

# 安装 pipreqs
RUN pip install --no-cache-dir pipreqs

# 自动生成 requirements.txt
RUN pipreqs . --force

# 安装自动生成的依赖
RUN pip install --no-cache-dir -r requirements.txt

# 暴露应用运行的端口
EXPOSE 8920

# 启动命令
CMD ["python", "app.py"]
