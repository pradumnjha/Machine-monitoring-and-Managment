import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { NodeSSH } from 'node-ssh';
import si from 'systeminformation';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const PORT = process.env.PORT || 3000;

// Store SSH connections
const sshConnections = new Map<string, NodeSSH>();

app.use(express.json());

// API endpoints
app.post('/api/servers/:id/:action', async (req, res) => {
  const { id, action } = req.params;
  const ssh = sshConnections.get(id);

  if (!ssh) {
    return res.status(404).json({ error: 'Server not found' });
  }

  try {
    switch (action) {
      case 'start':
        await ssh.execCommand('sudo systemctl start application');
        break;
      case 'stop':
        await ssh.execCommand('sudo systemctl stop application');
        break;
      case 'restart':
        await ssh.execCommand('sudo systemctl restart application');
        break;
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error(`Error performing ${action}:`, error);
    res.status(500).json({ error: 'Failed to perform action' });
  }
});

// Server monitoring
async function getServerMetrics(ssh: NodeSSH) {
  const metrics = {
    cpu: await si.currentLoad(),
    memory: await si.mem(),
    disk: await si.fsSize(),
    uptime: await si.time().uptime,
  };

  return metrics;
}

// WebSocket connection for real-time updates
io.on('connection', (socket) => {
  console.log('Client connected');

  // Send metrics every 5 seconds
  const interval = setInterval(async () => {
    for (const [serverId, ssh] of sshConnections.entries()) {
      try {
        const metrics = await getServerMetrics(ssh);
        socket.emit('metrics', { serverId, metrics });
      } catch (error) {
        console.error(`Error getting metrics for server ${serverId}:`, error);
      }
    }
  }, 5000);

  socket.on('disconnect', () => {
    clearInterval(interval);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});