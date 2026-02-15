import * as net from 'net';
import { WebContents } from 'electron';

export class TcpService {
    private servers: Map<number, net.Server> = new Map();
    private sockets: Map<number, net.Socket[]> = new Map(); // port -> active sockets

    constructor(private webContents: WebContents) { }

    public async startServer(port: number): Promise<{ success: boolean; error?: string }> {
        if (this.servers.has(port)) {
            return { success: false, error: `Port ${port} is already in use` };
        }

        return new Promise((resolve) => {
            const server = net.createServer((socket) => {
                this.handleConnection(port, socket);
            });

            server.on('error', (err: any) => {
                resolve({ success: false, error: err.message });
            });

            server.listen(port, '127.0.0.1', () => {
                this.servers.set(port, server);
                resolve({ success: true });
            });
        });
    }

    public async stopServer(port: number): Promise<boolean> {
        const server = this.servers.get(port);
        if (!server) return false;

        // Destroy all active sockets for this port
        const sockets = this.sockets.get(port) || [];
        sockets.forEach(s => s.destroy());
        this.sockets.delete(port);

        return new Promise((resolve) => {
            server.close(() => {
                this.servers.delete(port);
                resolve(true);
            });
        });
    }

    public write(port: number, data: Uint8Array | string) {
        const sockets = this.sockets.get(port);
        if (sockets) {
            sockets.forEach(socket => {
                if (!socket.destroyed) {
                    socket.write(data);
                }
            });
        }
    }

    private handleConnection(port: number, socket: net.Socket) {
        if (!this.sockets.has(port)) {
            this.sockets.set(port, []);
        }
        this.sockets.get(port)!.push(socket);

        socket.on('data', (data) => {
            // Forward data to Renderer
            if (!this.webContents.isDestroyed()) {
                this.webContents.send('tcp:data', { port, data });
            }
        });

        socket.on('close', () => {
            const list = this.sockets.get(port);
            if (list) {
                const idx = list.indexOf(socket);
                if (idx !== -1) list.splice(idx, 1);
            }
        });

        socket.on('error', (err) => {
            console.error(`Socket error on port ${port}:`, err);
        });
    }
}
