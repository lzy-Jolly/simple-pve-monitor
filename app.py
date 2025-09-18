from flask import Flask, render_template, jsonify, request
from proxmoxer import ProxmoxAPI
from config import Config
import json
import time
import logging
from flask_cors import CORS
from datetime import datetime, timedelta
import threading
import os

# 添加日志配置
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config.from_object(Config)
CORS(app)

# 存储自动关机时间 {vmid: {"auto_shutdown_time": timestamp, "auto_shutdown_delay": hours}}
auto_shutdown_times = {}

# docker 从环境变量中读取变量值
def get_proxmox_connection():
    """
    通过环境变量获取 Proxmox 连接信息。
    """
    return ProxmoxAPI(
        host=os.environ.get('PVE_HOST'),
        user=os.environ.get('PVE_USER'),
        token_name=os.environ.get('PVE_TOKEN_NAME'),
        token_value=os.environ.get('PVE_TOKEN_VALUE'),
        verify_ssl=os.environ.get('PVE_VERIFY_SSL', 'False').lower() in ('true', '1', 't')
    )


def get_proxmox_connection():
    """创建并返回Proxmox连接"""
    try:
        logger.debug("尝试连接Proxmox...")
        prox = ProxmoxAPI(
            app.config['PVE_HOST'],
            user=app.config['PVE_USER'],
            token_name=app.config['PVE_TOKEN_NAME'],
            token_value=app.config['PVE_TOKEN_VALUE'],
            verify_ssl=app.config['PVE_VERIFY_SSL']
        )
        logger.debug("Proxmox连接成功")
        return prox
    except Exception as e:
        logger.error(f"Proxmox连接失败: {e}")
        raise

@app.route('/')
def index():
    logger.debug("访问首页")
    return render_template('index.html')

@app.route('/api/node')
def get_node_info():
    try:
        logger.debug("获取节点信息")
        prox = get_proxmox_connection()
        nodes = prox.nodes.get()
        logger.debug(f"获取到节点: {nodes}")
        
        if nodes:
            node = nodes[0]
            # 确保所有值都存在，避免KeyError
            response_data = {
                "node": node.get('node', '未知'),
                "status": node.get('status', 'unknown'),
                "cpu_usage": round(node.get('cpu', 0) * 100, 1),
                "max_cpu": node.get('maxcpu', 0),
                "mem_usage": node.get('mem', 0),
                "max_mem": node.get('maxmem', 0),
                "mem_usage_percent": round((node.get('mem', 0) / node.get('maxmem', 1)) * 100, 1) if node.get('maxmem', 0) > 0 else 0,
                "disk_usage": node.get('disk', 0),
                "max_disk": node.get('maxdisk', 0),
                "disk_usage_percent": round((node.get('disk', 0) / node.get('maxdisk', 1)) * 100, 1) if node.get('maxdisk', 0) > 0 else 0,
                "uptime": node.get('uptime', 0)
            }
            logger.debug(f"节点响应数据: {response_data}")
            return jsonify(response_data)
        return jsonify({"error": "No nodes found"}), 404
    except Exception as e:
        logger.error(f"获取节点信息错误: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/vms')
def get_vms():
    try:
        logger.debug("获取虚拟机列表")
        prox = get_proxmox_connection()
        nodes = prox.nodes.get()
        if not nodes:
            return jsonify({"error": "No nodes found"}), 404
        
        vms_list = []
        node_name = nodes[0]['node']
        vms = prox.nodes(node_name).qemu.get()
        logger.debug(f"获取到虚拟机: {vms}")
        


        for vm in vms:
            vmid = vm.get('vmid')
            status = vm.get('status')
            # 如果开启的服务的时候pve已经有running的VM了，自动执行一次重置时间
            if status == 'running' and vmid not in auto_shutdown_times:
                uptime_seconds = vm.get('uptime', 0)
                uptime_hours = uptime_seconds / 3600
                current_time = time.time()
                
                if uptime_hours < 6:
                    new_delay = 6
                else:
                    hours_ceil = int(uptime_hours) + 1
                    new_delay = hours_ceil + 10/60
                
                auto_shutdown_times[vmid] = {
                    "auto_shutdown_time": current_time - uptime_seconds + new_delay * 3600,
                    "auto_shutdown_delay": new_delay
                }
                logger.info(f"服务启动后首次检测到运行中的VM {vmid}，自动设置其关机时间为 {new_delay:.2f} 小时后。")
            status = vm.get('status')


            # 计算运行时间
            uptime_seconds = vm.get('uptime', 0)
            uptime_hours = uptime_seconds // 3600
            uptime_minutes = (uptime_seconds % 3600) // 60
            
            # 计算内存使用率
            max_mem = vm.get('maxmem', 0)
            mem_usage = vm.get('mem', 0)
            mem_percent = round((mem_usage / max_mem) * 100, 1) if max_mem > 0 else 0
            
            # 获取自动关机信息
            vmid = vm.get('vmid')
            auto_shutdown_info = auto_shutdown_times.get(vmid, {})
            auto_shutdown_time = auto_shutdown_info.get('auto_shutdown_time')
            auto_shutdown_delay = auto_shutdown_info.get('auto_shutdown_delay', 6)  # 默认6小时
            
            # 格式化自动关机时间
            auto_shutdown_formatted = ""
            if auto_shutdown_time:
                # 转换为北京时间 (UTC+8)
                beijing_time = datetime.fromtimestamp(auto_shutdown_time) + timedelta(hours=8)
                auto_shutdown_formatted = beijing_time.strftime("%Y-%m-%d %H:%M")
            
            vms_list.append({
                "vmid": vmid,
                "name": vm.get('name', f"VM {vmid}"),
                "status": vm.get('status', 'unknown'),
                "cpu_usage": round(vm.get('cpu', 0) * 100, 1),
                "cpus": vm.get('cpus', 0),
                "mem_usage": mem_usage,
                "max_mem": max_mem,
                "mem_percent": mem_percent,
                "disk_usage": vm.get('disk', 0),
                "max_disk": vm.get('maxdisk', 0),
                "netin": vm.get('netin', 0),
                "netout": vm.get('netout', 0),
                "uptime": uptime_seconds,
                "uptime_formatted": f"{uptime_hours}h {uptime_minutes}m",
                "auto_shutdown_time": auto_shutdown_time,
                "auto_shutdown_formatted": auto_shutdown_formatted,
                "auto_shutdown_delay": auto_shutdown_delay
            })
        
        logger.debug(f"虚拟机列表响应: {len(vms_list)} 个VM")
        return jsonify(vms_list)
    except Exception as e:
        logger.error(f"获取虚拟机列表错误: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/vm/<int:vmid>/<action>', methods=['POST'])
def vm_action(vmid, action):
    try:
        prox = get_proxmox_connection()
        nodes = prox.nodes.get()
        if not nodes:
            return jsonify({"error": "No nodes found"}), 404
        
        # 使用第一个节点
        node_name = nodes[0]['node']
        
        if action == 'start':
            task = prox.nodes(node_name).qemu(vmid).status.start.post()
            # 设置默认自动关机时间 (6小时后)
            auto_shutdown_time = time.time() + 6 * 3600
            auto_shutdown_times[vmid] = {
                "auto_shutdown_time": auto_shutdown_time,
                "auto_shutdown_delay": 6
            }
        elif action == 'shutdown':
            task = prox.nodes(node_name).qemu(vmid).status.shutdown.post()
            # 清除自动关机时间
            if vmid in auto_shutdown_times:
                del auto_shutdown_times[vmid]
        elif action == 'reboot':
            task = prox.nodes(node_name).qemu(vmid).status.reboot.post()
            # 保持自动关机时间不变
        elif action == 'stop':
            task = prox.nodes(node_name).qemu(vmid).status.stop.post()
            # 清除自动关机时间
            if vmid in auto_shutdown_times:
                del auto_shutdown_times[vmid]
        else:
            return jsonify({"error": "Invalid action"}), 400
        
        return jsonify({"success": True, "task": task})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/vm/<int:vmid>/autoshutdown', methods=['POST'])
def vm_autoshutdown(vmid):
    try:
        data = request.get_json()
        action = data.get('action')
        
        # 获取虚拟机当前状态
        prox = get_proxmox_connection()
        nodes = prox.nodes.get()
        if not nodes:
            return jsonify({"error": "No nodes found"}), 404
        
        node_name = nodes[0]['node']
        vm_status = prox.nodes(node_name).qemu(vmid).status.current.get()
        uptime_seconds = vm_status.get('uptime', 0)
        
        current_time = time.time()
        
        if action == 'delay':
            # 延迟6小时
            if vmid in auto_shutdown_times:
                auto_shutdown_times[vmid]['auto_shutdown_time'] += 6 * 3600
                auto_shutdown_times[vmid]['auto_shutdown_delay'] += 6
            else:
                auto_shutdown_times[vmid] = {
                    "auto_shutdown_time": current_time + 6 * 3600,
                    "auto_shutdown_delay": 6
                }
                
        elif action == 'reset':
            # 重置关机时间
            uptime_hours = uptime_seconds / 3600
            
            if uptime_hours < 6:
                # 运行时间小于6小时，重置为6小时
                new_delay = 6
            else:
                # 运行时间大于6小时，向上取整到下一个小时再加10分钟
                hours_ceil = int(uptime_hours) + 1
                new_delay = hours_ceil + 10/60  # 小时 + 10分钟
            
            auto_shutdown_times[vmid] = {
                "auto_shutdown_time": current_time - uptime_seconds + new_delay * 3600,
                "auto_shutdown_delay": new_delay
            }
        
        return jsonify({"success": True, "auto_shutdown_time": auto_shutdown_times[vmid]['auto_shutdown_time']})
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# 自动关机检查线程
def auto_shutdown_check():
    while True:
        try:
            current_time = time.time()
            to_remove = []
            
            for vmid, shutdown_info in auto_shutdown_times.items():
                if shutdown_info['auto_shutdown_time'] <= current_time:
                    # 执行自动关机
                    try:
                        prox = get_proxmox_connection()
                        nodes = prox.nodes.get()
                        if nodes:
                            node_name = nodes[0]['node']
                            prox.nodes(node_name).qemu(vmid).status.shutdown.post()
                            logger.info(f"自动关机: VM {vmid}")
                            to_remove.append(vmid)
                    except Exception as e:
                        logger.error(f"自动关机失败: VM {vmid}, {e}")
            
            # 移除已关机的VM
            for vmid in to_remove:
                if vmid in auto_shutdown_times:
                    del auto_shutdown_times[vmid]
            
            # 每分钟检查一次
            time.sleep(60)
            
        except Exception as e:
            logger.error(f"自动关机检查错误: {e}")
            time.sleep(60)

# 启动自动关机检查线程
auto_shutdown_thread = threading.Thread(target=auto_shutdown_check, daemon=True)
auto_shutdown_thread.start()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8920)