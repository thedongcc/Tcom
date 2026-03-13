/**
 * TcpService
 * 负责 TCP 服务器的生命周期管理。
 */
export class TcpService {
    private servers: Map<number, any> = new Map();
    private webContents: any;

    constructor(webContents: any) {
        this.webContents = webContents;
    }

    startServer(port: number) {
        const net = require('net');
        if (this.servers.has(port)) {
            return { success: false, error: 'Server already running' };
        }

        const server = net.createServer((socket: any) => {
            socket.on('data', (data: Buffer) => {
                this.webContents.send('tcp:data', { port, data });
            });
            socket.on('error', (err: Error) => {
                this.webContents.send('tcp:error', { port, error: err.message });
            });
            socket.on('close', () => {
                this.webContents.send('tcp:client-disconnected', { port });
            });
        });

        server.listen(port, () => {
            this.servers.set(port, server);
            this.webContents.send('tcp:server-started', { port });
        });

        server.on('error', (err: any) => {
            this.webContents.send('tcp:error', { port, error: err.message });
        });

        return { success: true };
    }

    stopServer(port: number) {
        const server = this.servers.get(port);
        if (server) {
            server.close();
            this.servers.delete(port);
            this.webContents.send('tcp:server-stopped', { port });
            return true;
        }
        return false;
    }

    write(_port: number, _data: any) {
        // 预留：写入 TCP 客户端（需按服务端跟踪已连接 socket）
    }
}
